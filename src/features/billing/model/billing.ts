// 요금제·구독(#186). 요구사항 밖 추가 기능이라 서버 API가 아직 없다.
// ponytail: 지금 구독 상태는 이 브라우저(localStorage)에만 둔다. 서버에 구독 API가 생기면
// loadSubscription/saveSubscription만 API 호출로 바꾸면 된다.

export type PlanId = 'trial' | 'seller' | 'business'

export type Plan = {
  id: PlanId
  name: string
  // 원/월. 체험은 0
  price: number
  products: number | null
  calculations: string
  insights: string
  features: string[]
  // 가격 밑 한 줄 설명(세 카드 모두 있어야 아래 줄이 맞는다)
  note: string
  // 함께 쓰는 계정. 없으면 null
  seats: string | null
  recommended?: boolean
}

// 가격은 예시(11/5 사장님 승인 시안). 해외 발주 추천 앱(약 7만원~)보다 조금 아래.
export const PLANS: Plan[] = [
  {
    id: 'trial',
    name: '14일 체험',
    price: 0,
    products: 300,
    calculations: '제한 없음',
    insights: '월 100회',
    features: ['셀러와 똑같이', '카드 등록 없이', '끝나면 보기만'],
    note: '카드 등록 없이 · 셀러와 똑같이',
    seats: null,
  },
  {
    id: 'seller',
    name: '셀러',
    price: 49000,
    products: 300,
    calculations: '제한 없음',
    insights: '월 100회',
    features: [
      '상품 300개',
      '계산 제한 없음',
      'AI 인사이트 월 100회',
      '보관 비용',
    ],
    note: '매달 같은 날 자동 결제 · 언제든 해지',
    seats: null,
    recommended: true,
  },
  {
    id: 'business',
    name: '비즈니스',
    price: 129000,
    products: 2000,
    calculations: '제한 없음',
    insights: '제한 없음',
    features: ['상품 2,000개', 'AI 인사이트 제한 없음', '계정 5명 (준비 중)'],
    note: '상품이 많은 곳 · 함께 쓰는 계정 5명(준비 중)',
    seats: '5명 (준비 중)',
  },
]

export const TRIAL_DAYS = 14

// 요금제 카드의 같은 줄(11/5 사장님 — 카드끼리 무엇이 다른지 같은 높이에서 보이게). 없는 건 null → "—"
export const COMPARE: {
  label: string
  value: (plan: Plan) => string | null
  // 체험과 유료가 갈리는 줄은 노랗게(11/5 사장님 — 왜 결제하는지 한 줄에)
  highlight?: boolean
}[] = [
  {
    label: '관리 상품',
    value: (plan) => `${plan.products?.toLocaleString('ko-KR')}개`,
  },
  { label: '계산', value: (plan) => plan.calculations },
  { label: 'AI 인사이트', value: (plan) => plan.insights },
  {
    label: `${TRIAL_DAYS}일 뒤`,
    value: (plan) => (plan.id === 'trial' ? '보기만 (계산 멈춤)' : '계속 계산'),
    highlight: true,
  },
]

export function planOf(id: PlanId) {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0]
}

export type PayMethod = 'card' | 'kakaopay'

export const METHOD_LABEL: Record<PayMethod, string> = {
  card: '카드(KG이니시스)',
  kakaopay: '카카오페이',
}

// 결제 수단 고르는 칸: 이름과 오른쪽 작은 결제사 표시
export const METHOD_CHOICE: Record<PayMethod, { name: string; via: string }> = {
  card: { name: '신용·체크카드', via: 'KG이니시스' },
  kakaopay: { name: '카카오페이', via: '간편결제' },
}

export type Payment = {
  // YYYY-MM-DD
  paidOn: string
  plan: PlanId
  amount: number
  method: PayMethod | null
}

export type Subscription = {
  plan: PlanId
  // 체험 시작일·유료 시작일(YYYY-MM-DD)
  startedOn: string
  method: PayMethod | null
  history: Payment[]
  // 해지를 누르면 다음 결제일까지 쓰고 끝난다(#187). 그날을 적어 둔다.
  cancelOn?: string | null
  // 카드면 끝 4자리(결제사가 돌려주는 값, 지금은 모의)
  cardLast4?: string | null
  // 매달 결제가 안 됐을 때(카드 한도·만료 등). 다시 결제하면 지운다.
  renewalFailed?: { on: string; reason: string } | null
}

const KEY = 'ipgo:subscription'

export function isoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return isoDate(new Date(y, m - 1, d + days))
}

// 시작일의 일자를 기준으로 k달 뒤. 그 달에 없는 날(29~31일)은 그 달 말일로 하고,
// 다음 달엔 원래 일자로 돌아온다(1/31 → 2월 말 → 3/31, 서버 결제 원장과 같은 규칙).
function monthsAfter(iso: string, k: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const lastDay = new Date(y, m + k, 0).getDate()
  return isoDate(new Date(y, m - 1 + k, Math.min(d, lastDay)))
}

// 처음 열면 오늘부터 14일 체험을 시작한다.
export function loadSubscription(today = new Date()): Subscription {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Subscription
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 체험으로 본다.
  }
  const started = isoDate(today)
  const fresh: Subscription = {
    plan: 'trial',
    startedOn: started,
    method: null,
    history: [{ paidOn: started, plan: 'trial', amount: 0, method: null }],
  }
  saveSubscription(fresh)
  return fresh
}

// 위쪽 메뉴의 요금제 알약이 결제 직후 바로 바뀌도록 알린다(useSyncExternalStore용).
const CHANGED = 'ipgo:subscription-changed'

export function onSubscriptionChange(callback: () => void) {
  window.addEventListener(CHANGED, callback)
  return () => window.removeEventListener(CHANGED, callback)
}

export function subscriptionSnapshot() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveSubscription(subscription: Subscription) {
  try {
    localStorage.setItem(KEY, JSON.stringify(subscription))
    window.dispatchEvent(new Event(CHANGED))
  } catch {
    // 저장 못 해도 화면은 이어 간다.
  }
}

// 체험이 며칠 남았나(오늘 포함 안 함). 끝났으면 0
export function trialDaysLeft(subscription: Subscription, today = new Date()) {
  if (subscription.plan !== 'trial') return 0
  const end = addDays(subscription.startedOn, TRIAL_DAYS)
  const [y, m, d] = end.split('-').map(Number)
  const ms =
    new Date(y, m - 1, d).getTime() -
    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

// 유료는 시작일에서 한 달 뒤가 다음 결제일
// 다음 결제일: 시작일에서 한 달씩 넘겨 오늘 뒤의 첫 날(지난 날짜를 보여 주지 않게)
export function nextBillingOn(subscription: Subscription, today = new Date()) {
  if (subscription.plan === 'trial') return null
  const now = isoDate(today)
  let k = 1
  while (monthsAfter(subscription.startedOn, k) <= now) k++
  return monthsAfter(subscription.startedOn, k)
}

// 해지: 다음 결제일까지 쓰고 끝난다. 다시 누르면 해지를 취소한다.
export function setCancel(subscription: Subscription, cancel: boolean) {
  const next = {
    ...subscription,
    cancelOn: cancel ? nextBillingOn(subscription) : null,
  }
  saveSubscription(next)
  return next
}

export function subscribe(
  subscription: Subscription,
  plan: PlanId,
  method: PayMethod,
  today = new Date(),
  cardLast4: string | null = method === 'card' ? '4242' : null,
): Subscription {
  const paidOn = isoDate(today)
  const next: Subscription = {
    plan,
    startedOn: paidOn,
    method,
    cardLast4,
    renewalFailed: null,
    history: [
      { paidOn, plan, amount: planOf(plan).price, method },
      ...subscription.history,
    ],
  }
  saveSubscription(next)
  return next
}

// 결제 수단만 바꾼다(다음 결제부터). 매달 결제가 실패한 상태는 다시 결제해야 풀린다.
export function changeMethod(subscription: Subscription, method: PayMethod) {
  const next: Subscription = {
    ...subscription,
    method,
    cardLast4: method === 'card' ? '4242' : null,
  }
  saveSubscription(next)
  return next
}

// 모의: 매달 결제가 안 된 상태로 만든다(가짜 서버로 볼 때만 — 내 계정 주소에 ?renewal=사유).
export function markRenewalFailed(
  subscription: Subscription,
  reason: string,
  today = new Date(),
) {
  const next: Subscription = {
    ...subscription,
    renewalFailed: { on: isoDate(today), reason },
  }
  saveSubscription(next)
  return next
}

// 매달 결제 실패 마감: 실패일 + 7일(이 날까지는 계산 가능)
export function renewalDeadline(on: string) {
  return addDays(on, 7)
}

// 새 계산을 막아야 하나(#214). 체험이 끝났거나, 매달 결제 실패의 마감이 지났으면 이유를 돌려준다.
export function calcLock(
  subscription: Subscription,
  today = new Date(),
): { reason: 'TRIAL_ENDED' | 'PAYMENT_FAILED' } | null {
  if (subscription.plan === 'trial') {
    return trialDaysLeft(subscription, today) <= 0
      ? { reason: 'TRIAL_ENDED' }
      : null
  }
  const failed = subscription.renewalFailed
  if (failed && isoDate(today) > renewalDeadline(failed.on)) {
    return { reason: 'PAYMENT_FAILED' }
  }
  return null
}

// "11월 5일"
export function monthDayKo(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}월 ${d}일`
}

// 가짜 서버로 볼 때만(main.tsx가 부름): 주소에 ?demo=trial-ended 처럼 붙이면 그 구독 상태로 바꿔 둔다(예외 화면 확인용, #214).
export const DEMO_STATES = [
  'trial',
  'trial-ended',
  'seller',
  'pay-failed',
  'pay-locked',
] as const

export function demoSubscription(
  name: (typeof DEMO_STATES)[number],
  today = new Date(),
): Subscription {
  const ago = (days: number) => addDays(isoDate(today), -days)
  if (name === 'trial' || name === 'trial-ended') {
    const on = ago(name === 'trial' ? 0 : 20)
    return {
      plan: 'trial',
      startedOn: on,
      method: null,
      history: [{ paidOn: on, plan: 'trial', amount: 0, method: null }],
    }
  }
  const paid: Subscription = {
    plan: 'seller',
    startedOn: ago(32),
    method: 'card',
    cardLast4: '4242',
    history: [
      { paidOn: ago(32), plan: 'seller', amount: 49000, method: 'card' },
    ],
  }
  if (name === 'seller') return paid
  return {
    ...paid,
    renewalFailed: {
      on: ago(name === 'pay-failed' ? 1 : 10),
      reason: 'LIMIT_EXCEEDED',
    },
  }
}

export function applyDemoFromUrl(search: string) {
  const demo = new URLSearchParams(search).get('demo')
  if (demo && (DEMO_STATES as readonly string[]).includes(demo)) {
    saveSubscription(demoSubscription(demo as (typeof DEMO_STATES)[number]))
  }
}
