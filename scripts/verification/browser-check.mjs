import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { failureReason, fixtureResponse } from './browser-fixtures.mjs'

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
try {
  server = await createServer({
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
        blocked.push(response.blocked)
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
        'no_overflow',
        'no_browser_errors',
      ],
    })
    await context.close()
  }
  complete = true
} catch {
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
