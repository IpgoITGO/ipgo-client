import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { failureReason, fixtureResponse } from './browser-fixtures.mjs'
import {
  publishedPolicyFixturePlugin,
  verifySignupPolicy,
} from './signup-policy-browser.mjs'

process.umask(0o077)
const out =
  process.env.IPGO_VERIFY_OUTPUT ||
  fs.mkdtempSync(path.join(os.tmpdir(), 'ipgo-client-browser-'))
fs.mkdirSync(out, { recursive: true, mode: 0o700 })
const reports = []
let server,
  browser,
  page,
  complete = false
let phase = 'local_server'
let failureDiagnostic = null
try {
  server = await createServer({
    plugins: [publishedPolicyFixturePlugin()],
    server: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
    define: {
      'import.meta.env.VITE_ENABLE_MSW': JSON.stringify('false'),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api'),
    },
  })
  // 프로젝트 config는 유지하되 실제 API proxy가 설정된 환경에서는 검증을 중단한다.
  assert.ok(
    !Object.keys(server.config.server.proxy || {}).length,
    'REAL_API_PROXY_CONFIGURED',
  )
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  phase = 'chromium_launch'
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  for (const [name, width, height] of [
    ['desktop', 1280, 960],
    ['mobile', 390, 844],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    })
    phase = name + '_yearly_chart'
    page = await context.newPage()
    const errors = [],
      blocked = []
    page.on('pageerror', () => errors.push('PAGE_ERROR'))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push('CONSOLE_ERROR')
    })
    await context.route('**/*', (route) => {
      const request = route.request()
      const response = fixtureResponse(
        new URL(request.url()),
        request.method(),
        origin,
      )
      if (response.blocked) {
        blocked.push(
          `${request.method()} ${new URL(request.url()).pathname}: ${response.blocked}`,
        )
        return route.abort()
      }
      return response.asset
        ? route.continue()
        : route.fulfill({ status: 200, ...response })
    })
    await page.goto(`${origin}/sku/27`)
    const chart = page.getByRole('img', { name: '재고·출고 그래프' })
    await chart.waitFor({ state: 'visible' })
    await chart.scrollIntoViewIfNeeded()
    const series = chart.locator('[data-series="last-year-outbound"]')
    assert.equal(await series.locator('circle').count(), 3)
    assert.equal(
      (await series.locator('path').getAttribute('d')).match(/M/g).length,
      2,
    )
    const bounds = await chart.boundingBox()
    const coordinates = await chart.evaluate((svg) => ({
      width: svg.viewBox.baseVal.width,
      points: [
        ...svg.querySelectorAll('[data-series="last-year-outbound"] circle'),
      ].map((c) => +c.getAttribute('cx')),
    }))
    const [x0, x2] = coordinates.points
    await page.mouse.move(
      bounds.x + ((x0 + x2) / 2 / coordinates.width) * bounds.width,
      bounds.y + 80,
    )
    await page
      .getByText('기록 없음', { exact: true })
      .waitFor({ state: 'visible' })
    await page.mouse.move(
      bounds.x + (x2 / coordinates.width) * bounds.width,
      bounds.y + 80,
    )
    await page.getByText('0개', { exact: true }).waitFor({ state: 'visible' })
    await page.screenshot({
      path: path.join(out, `${name}-yearly.png`),
      fullPage: true,
    })
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
      'CHART_OVERFLOW',
    )
    phase = name + '_failure_screen'
    await page.goto(`${origin}/upload/15/result`)
    await page
      .getByText(failureReason, { exact: true })
      .waitFor({ state: 'visible' })
    await page
      .getByRole('button', { name: '다시 올리기', exact: true })
      .waitFor({ state: 'visible' })
    await page.screenshot({
      path: path.join(out, `${name}-failure.png`),
      fullPage: true,
    })
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
      'FAILURE_OVERFLOW',
    )
    phase = name + '_sparse_upload_history'
    await context.route(`${origin}/api/uploads/periods`, (route) => {
      if (route.request().method() !== 'GET') {
        blocked.push('UNEXPECTED_UPLOAD_PERIODS_WRITE')
        return route.abort()
      }
      return route.fulfill({
        json: {
          items: ['2024-03', '8744-10', '1024-01', '2024-12'].map(
            (period, index) => ({
              period,
              uploadId: index + 21,
              status: index === 1 ? 'FAILED' : 'DONE',
              fileName: `${period}.xlsx`,
              periodStart: `${period}-01`,
              periodEnd: `${period}-28`,
              uploadedAt: '2026-11-17T09:00:00Z',
              ...(index === 1
                ? {
                    error: {
                      code: 'INVALID_SOURCE',
                      message: '자료의 기간을 확인해 주세요.',
                    },
                  }
                : {}),
            }),
          ),
          latestUploadId: 24,
        },
      })
    })
    await page.goto(`${origin}/upload`)
    const history = page.getByRole('region', { name: '업로드 내역' })
    await history.getByRole('group', { name: '8744년' }).waitFor()
    const years = history.getByRole('group')
    assert.deepEqual(
      await years.evaluateAll((groups) =>
        groups.map((group) => group.getAttribute('aria-label')),
      ),
      ['8744년', '2024년', '1024년'],
    )
    assert.equal(await years.locator('li').count(), 36)
    assert.equal(
      await years
        .getByRole('link', { name: /8744년 10월 확인 실패/ })
        .getAttribute('href'),
      '/upload/22/result',
    )
    await history.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: path.join(out, `${name}-upload-history.png`),
      fullPage: true,
    })
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
      'UPLOAD_HISTORY_OVERFLOW',
    )
    phase = name + '_expiry_year'
    const fixtureJson = (pathname) =>
      JSON.parse(fixtureResponse(new URL(pathname, origin), 'GET', origin).body)
    const expiryDate = '2027-02-06'
    const dashboard = fixtureJson('/api/dashboard/replenishment-needs')
    const futureYear = new Date().getUTCFullYear() + 2
    for (const [pathname, json] of [
      [
        '/api/expiry',
        {
          asOfDate: '2026-11-03',
          imminentDays: 30,
          summary: { expired: 0, imminent: 0, ok: 1, unknown: 0 },
          items: [
            {
              productId: 27,
              skuBarcode: 'SKU-A',
              skuName: '연결 검증용 상품',
              receivedOn: '2026-11-01',
              expiryDate,
              daysLeft: 95,
              remainingQty: 5,
              status: 'OK',
            },
          ],
        },
      ],
      [
        '/api/dashboard/replenishment-needs',
        {
          ...dashboard,
          asOfDate: '2026-11-03',
          resultStatus: 'UP_TO_DATE',
          notNeededItems: [],
          excluded: [],
          summary: { ...dashboard.summary, needCount: 1 },
          items: [
            {
              productId: 27,
              resultId: 17,
              skuName: '연결 검증용 상품',
              skuBarcode: 'SKU-A',
              recommendedQty: 8,
              recommendedAmount: 80,
              expectedShortageOn: '2026-11-07',
              leadTimeDays: 3,
              preArrivalRisk: null,
            },
          ],
        },
      ],
      [
        '/api/results/17/scenarios',
        {
          ...fixtureJson('/api/results/17/scenarios'),
          scenarios: [
            {
              scenarioId: 1,
              type: 'P100',
              qty: 8,
              isDuplicate: false,
              expectedDepletionOn: `${futureYear}-01-01`,
              expectedEndingStock: 1,
              unmetDemandQty: 0,
              postArrivalUnmetQty: 0,
              postArrivalRisk: null,
            },
          ],
        },
      ],
    ]) {
      await context.route(`${origin}${pathname}`, (route) => {
        if (route.request().method() !== 'GET') {
          blocked.push('UNEXPECTED_EXPIRY_FIXTURE_WRITE')
          return route.abort()
        }
        return route.fulfill({ json })
      })
    }
    await page.goto(`${origin}/dashboard`)
    await page.getByText('2027. 2. 6', { exact: true }).waitFor()
    await page.screenshot({
      path: path.join(out, `${name}-expiry-dashboard.png`),
      fullPage: true,
    })
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
      'EXPIRY_DASHBOARD_OVERFLOW',
    )
    await page.goto(`${origin}/sku/27`)
    await page
      .getByText(/^유통기한 \d{4}\. \d{1,2}\. \d{1,2} 뒤에도 남아요$/)
      .waitFor()
    await page.screenshot({
      path: path.join(out, `${name}-expiry-detail.png`),
      fullPage: true,
    })
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
      'EXPIRY_DETAIL_OVERFLOW',
    )
    phase = name + '_model_support'
    const modelProduct = {
      productId: 142,
      skuName: '기간이 다른 상품',
      skuBarcode: 'model-period-fixture',
      unitCost: 10,
      isActive: true,
      settings: { leadTimeDays: 6, reviewCycleDays: 13, orderUnitQty: 3 },
      overridden: ['leadTimeDays', 'reviewCycleDays', 'orderUnitQty'],
    }
    for (const [endpoint, json] of [
      [
        '/api/dashboard/replenishment-needs',
        {
          asOfDate: '2026-11-18',
          today: '2026-11-18',
          daysSinceAsOf: 0,
          resultStatus: 'UP_TO_DATE',
          runId: 142,
          resultComputedAt: '2026-11-18T03:00:00Z',
          lastFailedRunAt: null,
          latestUploadId: 1,
          summary: {
            needCount: 0,
            notNeededCount: 0,
            notCalculableCount: 1,
            excludedCount: 0,
          },
          items: [],
          notNeededItems: [],
          excluded: [],
          notCalculable: [
            {
              productId: 142,
              skuName: modelProduct.skuName,
              reason:
                '이 모델은 배송 5일·발주 주기 14일·배수 1 조건에서만 계산해요',
              currentSettings: modelProduct.settings,
            },
          ],
        },
      ],
      [
        '/api/replenishment-settings',
        {
          confirmed: true,
          leadTimeDays: 5,
          reviewCycleDays: 14,
          orderUnitQty: 1,
          reviewCycleSource: 'DEFAULT',
          calculationSupport: {
            method: 'LGBM19',
            leadTimeDays: 5,
            reviewCycleDays: 14,
          },
        },
      ],
      ['/api/products?**', { items: [modelProduct], total: 1 }],
      ['/api/settings/expiry', { imminentDays: 30 }],
    ]) {
      await context.route(`${origin}${endpoint}`, (route) => {
        if (route.request().method() !== 'GET') {
          blocked.push('UNEXPECTED_MODEL_SUPPORT_WRITE')
          return route.abort()
        }
        return route.fulfill({ json })
      })
    }
    await page.goto(`${origin}/dashboard?tab=na`)
    await page
      .getByText('현재 입고 조건: 리드타임 6일 · 입고 주기 13일', {
        exact: true,
      })
      .waitFor()
    await page.screenshot({
      path: path.join(out, `${name}-model-support-dashboard.png`),
      fullPage: true,
    })
    await page
      .getByRole('link', { name: '기간이 다른 상품 입고 조건 확인' })
      .click()
    await page
      .getByRole('complementary', { name: '예측 모델 지원 조건' })
      .waitFor()
    const modelLead = page.getByLabel('기간이 다른 상품 leadTime', {
      exact: true,
    })
    await modelLead.waitFor({ state: 'visible' })
    assert.equal(await modelLead.inputValue(), '6')
    assert.equal(
      await page
        .getByLabel('기간이 다른 상품 orderCycle', { exact: true })
        .inputValue(),
      '13',
    )
    assert.equal(
      await page
        .getByLabel('기간이 다른 상품 inboundUnit', { exact: true })
        .inputValue(),
      '3',
    )
    await page.screenshot({
      path: path.join(out, `${name}-model-support-settings.png`),
      fullPage: true,
    })
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
      'MODEL_SUPPORT_OVERFLOW',
    )
    assert.deepEqual(blocked, [])
    assert.deepEqual(errors, [])
    reports.push({
      viewport: name,
      width,
      passed: true,
      provenance: 'synthetic_local_API',
      checks: [
        'failure_and_retry',
        'yearly_series',
        'zero_and_missing',
        'gap',
        'tooltip',
        'sparse_upload_history',
        'expiry_year_dashboard_and_detail',
        'model_support_and_settings_navigation',
        'no_overflow',
        'no_browser_errors',
      ],
    })
    await context.close()
    phase = name + '_signup_policy'
    reports.push(
      await verifySignupPolicy({ browser, origin, out, name, width, height }),
    )
  }
  complete = true
} catch (error) {
  failureDiagnostic =
    error.code === 'ERR_ASSERTION' ? error.message.slice(0, 700) : error.name
  process.exitCode = 1
  if (page && !page.isClosed())
    await page
      .screenshot({ path: path.join(out, 'failure.png') })
      .catch(() => {})
} finally {
  await browser?.close()
  await server?.close()
  const result = {
    complete,
    failure_phase: complete ? null : phase,
    failure_diagnostic: failureDiagnostic,
    reports,
    business_e2e: 'not_verified',
    actual_savings: 'not_measured',
    external_api_write: false,
  }
  fs.writeFileSync(
    path.join(out, 'browser-result.json'),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  )
  console.log(
    JSON.stringify({
      browser_verified: complete,
      output: out,
      viewports: reports.map((r) => r.viewport),
    }),
  )
}
