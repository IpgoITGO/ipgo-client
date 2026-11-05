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
  },
]

export const TRIAL_DAYS = 14

export function planOf(id: PlanId) {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0]
}

export type PayMethod = 'card' | 'kakaopay'

export const METHOD_LABEL: Record<PayMethod, string> = {
  card: '카드(KG이니시스)',
  kakaopay: '카카오페이',
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

function addMonth(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return isoDate(new Date(y, m, d))
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
export function nextBillingOn(subscription: Subscription) {
  return subscription.plan === 'trial' ? null : addMonth(subscription.startedOn)
}

export function subscribe(
  subscription: Subscription,
  plan: PlanId,
  method: PayMethod,
  today = new Date(),
): Subscription {
  const paidOn = isoDate(today)
  const next: Subscription = {
    plan,
    startedOn: paidOn,
    method,
    history: [
      { paidOn, plan, amount: planOf(plan).price, method },
      ...subscription.history,
    ],
  }
  saveSubscription(next)
  return next
}

// "11월 5일"
export function monthDayKo(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}월 ${d}일`
}
