import { http, HttpResponse } from 'msw'

import { mockAccountKey } from '../../../auth/mocks/handlers'
import type {
  Invoice,
  PaymentMethodRow,
  ServerPlan,
  ServerSubscription,
  SessionResult,
} from '../model/billingApi'

// 서버 결제 API(#294)를 메모리에서 흉내 낸다. 상태는 이 파일 안에만 있고 새로고침하면 처음으로 돌아간다.
const CONSENT = 'monthly-2026-11-v1'
const DAY = 86_400_000
const PLANS: ServerPlan[] = [
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
    consentVersion: CONSENT,
  },
  {
    planId: 'business',
    priceVersion: 'business-v1',
    amount: 129000,
    currency: 'KRW',
    interval: 'MONTH',
    products: 2000,
    monthlyInsights: null,
    testMode: true,
    trialDays: 14,
    consentVersion: CONSENT,
  },
]

type Sub = Omit<ServerSubscription, 'entitlements'>

const iso = (ms: number) => new Date(ms).toISOString()

function entitlements(sub: Sub): ServerSubscription['entitlements'] {
  const reasons: Record<string, ServerSubscription['entitlements']['reason']> =
    {
      TRIAL_EXPIRED: 'TRIAL_ENDED',
      SUSPENDED: 'PAYMENT_FAILED',
      CANCELED: 'SUBSCRIPTION_ENDED',
    }
  const reason = reasons[sub.status] ?? null
  return {
    canCalculate: !reason,
    canUpload: !reason,
    canGenerateInsight: !reason,
    productLimit: sub.planId === 'business' ? 2000 : 300,
    monthlyInsightLimit: sub.planId === 'business' ? null : 100,
    reason,
  }
}

export const DEMO_STATES = [
  'trial',
  'trial-ended',
  'seller',
  'pay-failed',
  'pay-locked',
] as const
type Demo = (typeof DEMO_STATES)[number]

function demoSub(name: Demo, now: number): Sub {
  if (name === 'trial' || name === 'trial-ended') {
    return {
      planId: 'trial',
      status: name === 'trial' ? 'TRIALING' : 'TRIAL_EXPIRED',
      trialEnd: iso(now + (name === 'trial' ? 14 : -6) * DAY),
      periodStart: null,
      periodEnd: null,
      nextChargeAt: null,
      cancelAtPeriodEnd: false,
      graceUntil: null,
      amount: null,
      priceVersion: null,
    }
  }
  const failed = name !== 'seller'
  return {
    planId: 'seller',
    status: !failed
      ? 'ACTIVE'
      : name === 'pay-failed'
        ? 'PAST_DUE'
        : 'SUSPENDED',
    trialEnd: null,
    periodStart: iso(now - (failed ? 32 : 5) * DAY),
    periodEnd: iso(now + (failed ? -2 : 25) * DAY),
    nextChargeAt: failed ? null : iso(now + 25 * DAY),
    cancelAtPeriodEnd: false,
    graceUntil: !failed
      ? null
      : iso(now + (name === 'pay-failed' ? 6 : -3) * DAY),
    amount: 49000,
    priceVersion: 'seller-v1',
  }
}

// 화면이 쓰는 구독 모양(체험 시작·예외 상태 시험용으로 바깥에서도 쓴다)
export function demoSubscription(
  name: Demo,
  now = Date.now(),
): ServerSubscription {
  const sub = demoSub(name, now)
  return { ...sub, entitlements: entitlements(sub) }
}

type State = {
  sub: Sub
  methods: PaymentMethodRow[]
  invoices: Invoice[]
  sessions: Map<
    string,
    {
      purpose: string
      planId?: string
      gets: number
      /** 이 등록을 만든 요청 키들(같은 키를 다시 보내면 같은 세션, 닫힌 세션이면 409) */
      keys: string[]
    } & SessionResult
  >
  lastDemo: Demo | null
}

const fresh = (): State => ({
  sub: demoSub('trial', Date.now()),
  methods: [],
  invoices: [],
  sessions: new Map(),
  lastDemo: null,
})
let state = fresh()

const CARD = '433012******1234'
const paidCard = (): PaymentMethodRow => ({
  id: 1,
  maskedNumber: CARD,
  current: true,
  status: 'ACTIVE',
})

// 예외 상태로 바꾼다(주소의 ?demo=… 또는 테스트에서)
export function applyMockDemo(name: Demo) {
  state = fresh()
  state.lastDemo = name
  state.sub = demoSub(name, Date.now())
  if (state.sub.planId === 'seller') {
    state.methods = [paidCard()]
    const failed = state.sub.status !== 'ACTIVE'
    state.invoices = [
      {
        invoiceId: 1,
        planId: 'seller',
        amount: 49000,
        currency: 'KRW',
        periodStart: state.sub.periodStart!,
        periodEnd: state.sub.periodEnd!,
        status: 'PAID',
        paymentStatus: 'SUCCEEDED',
        paidAt: state.sub.periodStart,
      },
      ...(failed
        ? [
            {
              invoiceId: 2,
              planId: 'seller' as const,
              amount: 49000,
              currency: 'KRW',
              periodStart: state.sub.periodEnd!,
              periodEnd: iso(Date.now() + 28 * DAY),
              status: 'OPEN',
              paymentStatus: 'DECLINED',
              paidAt: null,
            },
          ]
        : []),
    ]
  }
}

// 테스트에서 구독 값 일부만 바꾼다
export function patchMockSubscription(patch: Partial<Sub>) {
  Object.assign(state.sub, patch)
}

// 만료 경로를 시험할 때만 사용한다.
export function expireMockRegistrationSession(id: string) {
  const session = state.sessions.get(id)
  if (!session) throw new Error('세션을 찾을 수 없어요.')
  session.status = 'EXPIRED'
}

export function resetBillingMock() {
  state = fresh()
}

const unauthorized = () =>
  HttpResponse.json(
    { code: 'UNAUTHENTICATED', message: '로그인이 필요해요.' },
    { status: 401 },
  )
const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ code, message }, { status })

// 변경 요청은 중복 방지 키가 있어야 한다(서버와 같은 규칙)
function badKey(request: Request) {
  const key = request.headers.get('Idempotency-Key')
  return key && /^[A-Za-z0-9_-]{8,100}$/.test(key)
    ? null
    : fail(400, 'IDEMPOTENCY_KEY_REQUIRED', '요청 키가 필요해요.')
}

const subscriptionBody = (): ServerSubscription => ({
  ...state.sub,
  entitlements: entitlements(state.sub),
})

function monthAfter(ms: number) {
  const d = new Date(ms)
  d.setMonth(d.getMonth() + 1)
  return d.getTime()
}

// 결제 확인: 두 번째 조회에서 결제됨으로 바꾼다(서버 작업자가 1분 안에 결제하는 흐름)
function charge(sessionId: string) {
  const session = state.sessions.get(sessionId)!
  const plan = PLANS.find((p) => p.planId === session.planId)
  if (!plan) return
  const now = Date.now()
  state.sub = {
    planId: plan.planId,
    status: 'ACTIVE',
    trialEnd: null,
    periodStart: iso(now),
    periodEnd: iso(monthAfter(now)),
    nextChargeAt: iso(monthAfter(now)),
    cancelAtPeriodEnd: false,
    graceUntil: null,
    amount: plan.amount,
    priceVersion: plan.priceVersion,
  }
  const invoice = state.invoices.find((i) => i.invoiceId === session.invoiceId)
  if (invoice) {
    invoice.status = 'PAID'
    invoice.paymentStatus = 'SUCCEEDED'
    invoice.paidAt = iso(now)
  }
  session.paymentStatus = 'SUCCEEDED'
}

const sessionBody = ({
  sessionId,
  status,
  invoiceId,
  paymentStatus,
  errorCode,
}: SessionResult) => ({
  sessionId,
  status,
  invoiceId,
  paymentStatus,
  errorCode,
})

export const billingHandlers = [
  http.get('/api/billing/plans', ({ request }) =>
    mockAccountKey(request) ? HttpResponse.json(PLANS) : unauthorized(),
  ),
  http.get('/api/billing/subscription', ({ request }) => {
    if (!mockAccountKey(request)) return unauthorized()
    // 주소의 ?demo=… 로 예외 화면을 본다. 한 번 고른 상태는 화면을 옮겨도 유지한다.
    const demo = new URL(request.referrer || 'http://x').searchParams.get(
      'demo',
    )
    if (
      demo &&
      demo !== state.lastDemo &&
      (DEMO_STATES as readonly string[]).includes(demo)
    ) {
      applyMockDemo(demo as Demo)
    }
    return HttpResponse.json(subscriptionBody())
  }),
  http.get('/api/billing/payment-methods', ({ request }) =>
    mockAccountKey(request) ? HttpResponse.json(state.methods) : unauthorized(),
  ),
  http.get('/api/billing/invoices', ({ request }) =>
    mockAccountKey(request)
      ? HttpResponse.json({ items: state.invoices, nextCursor: null })
      : unauthorized(),
  ),
  http.post('/api/billing/registration-sessions', async ({ request }) => {
    if (!mockAccountKey(request)) return unauthorized()
    const rejected = badKey(request)
    if (rejected) return rejected
    const body = (await request.json()) as {
      purpose: string
      planId?: string
      priceVersion?: string
      consentVersion?: string
    }
    if (body.consentVersion !== CONSENT) {
      return fail(409, 'BILLING_CONSENT_REQUIRED', '동의가 필요해요.')
    }
    if (body.purpose === 'START_SUBSCRIPTION') {
      const plan = PLANS.find((p) => p.planId === body.planId)
      if (!plan || plan.priceVersion !== body.priceVersion) {
        return fail(409, 'PLAN_PRICE_CHANGED', '요금이 바뀌었어요.')
      }
    }
    // server #189: 같은 키는 같은 세션(닫혔으면 CANCELED/EXPIRED 409), 열린 같은 목적·요금제는 새 키여도 이어받기, 다르면 409
    const key = request.headers.get('Idempotency-Key') ?? ''
    const byKey = [...state.sessions.values()].find((item) =>
      item.keys.includes(key),
    )
    if (byKey && byKey.status === 'CANCELED')
      return fail(409, 'BILLING_SESSION_CANCELED', '닫힌 결제 시도예요.')
    if (byKey && byKey.status === 'EXPIRED')
      return fail(409, 'BILLING_SESSION_EXPIRED', '시간이 지난 결제 시도예요.')
    if (byKey && byKey.status !== 'OPEN')
      return fail(
        409,
        'BILLING_IN_PROGRESS',
        '이전 결제 시도가 아직 끝나지 않았어요.',
      )
    const open = [...state.sessions.values()].find(
      (item) => item.status === 'OPEN',
    )
    // 같은 키는 열린 세션만 이어받는다.
    const target = byKey ?? open
    if (
      !byKey &&
      open &&
      (open.purpose !== body.purpose || open.planId !== body.planId)
    )
      return fail(
        409,
        'BILLING_IN_PROGRESS',
        '이전 결제 시도가 아직 끝나지 않았어요.',
      )
    const sessionId = target?.sessionId ?? `sess_${state.sessions.size + 1}`
    const customerKey = 'cust_mock'
    const sessionState = `state_${sessionId}`
    if (open && !byKey) open.keys.push(key)
    else if (!target)
      state.sessions.set(sessionId, {
        keys: [key],
        sessionId,
        purpose: body.purpose,
        planId: body.planId,
        status: 'OPEN',
        invoiceId: null,
        paymentStatus: null,
        errorCode: null,
        gets: 0,
      })
    const origin = new URL(request.url).origin
    const query = `sessionId=${sessionId}&state=${sessionState}`
    return HttpResponse.json(
      {
        sessionId,
        customerKey,
        state: sessionState,
        expiresAt: iso(Date.now() + 600_000),
        successUrl: `${origin}/billing/auth/success?${query}`,
        failUrl: `${origin}/billing/auth/fail?${query}`,
      },
      { status: 201 },
    )
  }),
  // server #189 등록 취소: 열린 시도만 닫는다(발급 중·결과 미확정은 409), 반복해도 같은 결과
  http.post(
    '/api/billing/registration-sessions/:id/cancel',
    ({ request, params }) => {
      if (!mockAccountKey(request)) return unauthorized()
      const rejected = badKey(request)
      if (rejected) return rejected
      const session = state.sessions.get(String(params.id))
      if (!session) return fail(404, 'NOT_FOUND', '세션을 찾을 수 없어요.')
      if (session.status === 'OPEN') session.status = 'CANCELED'
      else if (session.status !== 'CANCELED' && session.status !== 'EXPIRED')
        return fail(409, 'BILLING_IN_PROGRESS', '결제를 확인하고 있어요.')
      return HttpResponse.json(sessionBody(session))
    },
  ),
  http.post(
    '/api/billing/registration-sessions/:id/complete',
    async ({ request, params }) => {
      if (!mockAccountKey(request)) return unauthorized()
      const rejected = badKey(request)
      if (rejected) return rejected
      const session = state.sessions.get(String(params.id))
      if (!session) return fail(404, 'NOT_FOUND', '세션을 찾을 수 없어요.')
      const body = (await request.json()) as { authKey?: string }
      if (!body.authKey)
        return fail(400, 'INVALID_INPUT', '값을 확인해 주세요.')
      session.status = 'COMPLETED'
      state.methods = [paidCard()]
      if (session.purpose === 'START_SUBSCRIPTION') {
        const plan = PLANS.find((p) => p.planId === session.planId)!
        const now = Date.now()
        session.invoiceId = state.invoices.length + 1
        session.paymentStatus = 'READY'
        state.invoices.unshift({
          invoiceId: session.invoiceId,
          planId: plan.planId,
          amount: plan.amount,
          currency: 'KRW',
          periodStart: iso(now),
          periodEnd: iso(monthAfter(now)),
          status: 'OPEN',
          paymentStatus: 'READY',
          paidAt: null,
        })
      }
      return HttpResponse.json(sessionBody(session), { status: 202 })
    },
  ),
  http.get('/api/billing/registration-sessions/:id', ({ request, params }) => {
    if (!mockAccountKey(request)) return unauthorized()
    const session = state.sessions.get(String(params.id))
    if (!session) return fail(404, 'NOT_FOUND', '세션을 찾을 수 없어요.')
    session.gets += 1
    if (session.gets >= 2 && session.paymentStatus === 'READY') {
      charge(session.sessionId)
    }
    return HttpResponse.json(sessionBody(session))
  }),
  http.post('/api/billing/subscription/cancel', ({ request }) => {
    if (!mockAccountKey(request)) return unauthorized()
    const rejected = badKey(request)
    if (rejected) return rejected
    state.sub.cancelAtPeriodEnd = true
    state.sub.nextChargeAt = null
    return HttpResponse.json(subscriptionBody())
  }),
  http.post('/api/billing/subscription/resume', async ({ request }) => {
    if (!mockAccountKey(request)) return unauthorized()
    const rejected = badKey(request)
    if (rejected) return rejected
    const body = (await request.json()) as { consentVersion?: string }
    if (body.consentVersion !== CONSENT) {
      return fail(409, 'BILLING_CONSENT_REQUIRED', '동의가 필요해요.')
    }
    state.sub.cancelAtPeriodEnd = false
    state.sub.nextChargeAt = state.sub.periodEnd
    return HttpResponse.json(subscriptionBody())
  }),
  http.post('/api/billing/invoices/:id/retry', ({ request, params }) => {
    if (!mockAccountKey(request)) return unauthorized()
    const rejected = badKey(request)
    if (rejected) return rejected
    const invoice = state.invoices.find(
      (item) => String(item.invoiceId) === params.id,
    )
    if (!invoice || invoice.paymentStatus !== 'DECLINED') {
      return fail(409, 'BILLING_IN_PROGRESS', '다시 결제할 수 없는 내역이에요.')
    }
    invoice.paymentStatus = 'READY'
    return HttpResponse.json(
      { invoiceId: invoice.invoiceId, status: invoice.status },
      { status: 202 },
    )
  }),
  http.post(
    '/api/billing/invoices/:id/cancel-payment',
    async ({ request, params }) => {
      if (!mockAccountKey(request)) return unauthorized()
      const rejected = badKey(request)
      if (rejected) return rejected
      const body = (await request.json()) as { reason?: string }
      if (!body.reason?.trim() || body.reason.length > 200)
        return fail(400, 'INVALID_INPUT', '취소 사유를 확인해 주세요')
      const invoice = state.invoices.find(
        (item) => String(item.invoiceId) === params.id,
      )
      if (
        !invoice ||
        (invoice.status !== 'PAID' && invoice.refundStatus !== 'CANCELED')
      )
        return fail(409, 'PAYMENT_NOT_APPROVED', '승인된 결제를 확인해 주세요')
      invoice.status = 'VOID'
      invoice.refundStatus = 'CANCELED'
      invoice.canceledAt = new Date().toISOString()
      state.sub.status = 'CANCELED'
      state.sub.periodEnd = invoice.canceledAt
      state.sub.cancelAtPeriodEnd = true
      state.sub.nextChargeAt = null
      return HttpResponse.json({
        invoiceId: invoice.invoiceId,
        status: 'CANCELED',
        canceledAt: invoice.canceledAt,
      })
    },
  ),
]
