import fs from 'node:fs'

export const failureReason =
  '전월 잔여 재고의 재고관리단위가 이번 자료에 없어요(3개). 전월 자료와 같은 셀러·창고의 수불부인지 확인해 주세요.'

// 모두 합성 자료다. 알 수 없는 요청은 실제 API로 넘기지 않는다.
export function fixtureResponse(url, method, origin) {
  if (url.origin === 'https://fonts.googleapis.com' && method === 'GET')
    return { contentType: 'text/css', body: '' }
  if (url.origin !== origin) return { blocked: 'EXTERNAL_ORIGIN' }
  if (!url.pathname.startsWith('/api/')) return { asset: true }
  const expectedMethod = url.pathname === '/api/auth/refresh' ? 'POST' : 'GET'
  if (method !== expectedMethod) return { blocked: 'UNEXPECTED_API_WRITE' }
  let body
  switch (url.pathname) {
    case '/api/auth/csrf':
      body = { headerName: 'X-CSRF-TOKEN', token: 'fixture-only' }
      break
    case '/api/auth/refresh':
      body = { accessToken: 'fixture-only' }
      break
    case '/api/auth/me':
      body = {
        userId: 1,
        email: 'ui-test@example.test',
        managerName: '화면 검증',
        companyName: '합성 검증',
      }
      break
    case '/api/dashboard/replenishment-needs':
      body = {
        asOfDate: null,
        today: '2026-11-11',
        daysSinceAsOf: null,
        resultStatus: null,
        runId: null,
        resultComputedAt: null,
        lastFailedRunAt: null,
        latestUploadId: null,
        summary: {
          needCount: 0,
          notNeededCount: 0,
          notCalculableCount: 0,
          excludedCount: 0,
        },
        items: [],
        notCalculable: [],
      }
      break
    case '/api/billing/subscription':
      body = {
        planId: 'trial',
        status: 'TRIALING',
        trialEnd: '2026-12-11T00:00:00Z',
        periodStart: null,
        periodEnd: null,
        nextChargeAt: null,
        cancelAtPeriodEnd: false,
        graceUntil: null,
        amount: 0,
        priceVersion: 'test-fixture',
        entitlements: {
          canCalculate: true,
          canUpload: true,
          canGenerateInsight: true,
          productLimit: 300,
          monthlyInsightLimit: 100,
          reason: null,
        },
      }
      break
    case '/api/billing/plans':
      body = [
        {
          planId: 'seller',
          priceVersion: 'seller-v1',
          amount: 49000,
          currency: 'KRW',
          interval: 'MONTH',
          products: 300,
          monthlyInsights: 100,
          testMode: true,
          trialDays: 14,
          consentVersion: 'monthly-2026-11-v1',
        },
      ]
      break
    case '/api/expiry':
      body = {
        asOfDate: null,
        imminentDays: 30,
        summary: { expired: 0, imminent: 0, ok: 0, unknown: 0 },
        items: [],
      }
      break
    case '/api/planned-receipts':
      body = { items: [], total: 0 }
      break
    case '/api/settings/storage-cost':
      body = { ratePerCbm: null, boxes: [] }
      break
    case '/api/planned-quantities':
      body = { items: [] }
      break
    case '/api/results/17/scenarios':
      body = {
        resultId: 17,
        isEstimate: false,
        preArrivalRisk: null,
        riskSampleSize: null,
        riskStatus: 'INSUFFICIENT_SAMPLE',
        scenarios: [],
      }
      break
    case '/api/results/17/insight':
      body = {
        mode: 'NONE',
        explanationDisabled: true,
        generating: false,
        sentences: [],
        state: 'NOT_CALCULABLE',
        stateReason: null,
        failReason: null,
        stale: false,
      }
      break
    case '/api/products/27/detail':
      body = JSON.parse(
        fs.readFileSync(
          new URL(
            '../../src/features/sku/model/fixtures/accuracy-history-k1.json',
            import.meta.url,
          ),
          'utf8',
        ),
      )
      body.product.skuName = '연결 검증용 상품'
      body.trend = [5000, null, 0, 20].map((lastYearOutboundQty, i) => ({
        date: `2026-10-0${i + 1}`,
        closingQty: 10,
        outboundQty: 3,
        isValidObservation: true,
        lastYearOutboundQty,
      }))
      break
    case '/api/uploads/periods':
      body = { items: [], latestUploadId: null }
      break
    case '/api/uploads/15':
      body = {
        uploadId: 15,
        status: 'FAILED',
        error: {
          code: 'INVALID_SOURCE',
          message: '기존 안내',
          reason: failureReason,
          details: { reason: 'PREVIOUS_MONTH_MISMATCH' },
        },
      }
      break
    default:
      return { blocked: 'UNMOCKED_API' }
  }
  return { contentType: 'application/json', body: JSON.stringify(body) }
}
