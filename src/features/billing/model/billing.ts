// 요금제 화면 표시용 정보와 서버 구독을 화면 말로 바꾸는 도구(#294). 구독 자체는 서버(billingApi.ts)가 기준이다.

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

// 가격은 예시(11/5 승인 시안). 해외 발주 추천 앱(약 7만원~)보다 조금 아래.
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

// 요금제 카드의 같은 줄(11/5 — 카드끼리 무엇이 다른지 같은 높이에서 보이게). 없는 건 null → "—"
export const COMPARE: {
  label: string
  value: (plan: Plan) => string | null
  // 체험과 유료가 갈리는 줄은 노랗게(11/5 — 왜 결제하는지 한 줄에)
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

export type { ServerSubscription as Subscription } from './billingApi'
import type { ServerSubscription as Subscription } from './billingApi'

export function isoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 서버가 주는 시각(ISO)을 내 컴퓨터 날짜(YYYY-MM-DD)로
export const dayOf = (instant: string) => isoDate(new Date(instant))

// 체험이 며칠 남았나(오늘 포함 안 함). 끝났으면 0
export function trialDaysLeft(subscription: Subscription, today = new Date()) {
  if (subscription.planId !== 'trial' || !subscription.trialEnd) return 0
  if (subscription.status === 'TRIAL_EXPIRED') return 0
  const end = new Date(subscription.trialEnd)
  const ms =
    new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() -
    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

// 새 계산을 막아야 하나(#214). 서버가 알려 준 권한(entitlements)을 그대로 따른다.
export function calcLock(subscription: Subscription) {
  const { canCalculate, reason } = subscription.entitlements
  return canCalculate ? null : { reason: reason ?? 'TRIAL_ENDED' }
}

export const TRIAL_ALREADY_USED_MESSAGE =
  '이전에 무료 체험을 쓴 이메일이에요. 결제 후 이용할 수 있어요.'

// 신규 사유를 보내는 서버에만 반응한다. 권한이 허용된 계정은 사유만으로 막지 않는다.
export function trialAlreadyUsed(subscription: Subscription) {
  return calcLock(subscription)?.reason === 'TRIAL_ALREADY_USED'
}

// 결제가 안 돼 유예 중이거나 멈춘 상태. 모르는 상태값은 정상으로 본다.
export function paymentProblem(subscription: Subscription) {
  return subscription.status === 'PAST_DUE' ||
    subscription.status === 'SUSPENDED'
    ? { until: subscription.graceUntil }
    : null
}

// "11월 5일"
export function monthDayKo(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}월 ${d}일`
}
