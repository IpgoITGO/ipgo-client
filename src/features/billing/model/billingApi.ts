import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'

import { ApiError, apiRequest } from '../../../shared/api/client'

export type CancellationReason =
  | 'PRICE'
  | 'NOT_USING'
  | 'MISSING_FEATURE'
  | 'PREDICTION_QUALITY'
  | 'OTHER_SERVICE'
  | 'OTHER'
export type CancellationFeedback = {
  reasons: CancellationReason[]
  note?: string
}

// 서버 결제 API(#294, ipgo-server). 구독·요금제·카드·결제 내역은 모두 여기서 받는다.
export type ServerPlan = {
  planId: 'seller' | 'business'
  priceVersion: string
  amount: number
  currency: string
  interval: 'MONTH' | 'ONE_TIME'
  products: number
  monthlyInsights: number | null
  testMode: boolean
  trialDays: number
  consentVersion: string
}

export type ServerSubscription = {
  // 구버전 API에서 누락되면 기존 계정으로 취급한다. null만 미선택이다.
  planChosenAt?: string | null
  planId: 'trial' | 'seller' | 'business'
  // 이 밖의 값이 와도 화면이 깨지지 않게 string도 받는다
  status:
    | 'NOT_SELECTED'
    | 'TRIALING'
    | 'TRIAL_EXPIRED'
    | 'ACTIVE'
    | 'PAST_DUE'
    | 'SUSPENDED'
    | 'CANCELED'
    | (string & {})
  trialEnd: string | null
  periodStart: string | null
  periodEnd: string | null
  nextChargeAt: string | null
  cancelAtPeriodEnd: boolean
  graceUntil: string | null
  amount: number | null
  priceVersion: string | null
  entitlements: {
    canCalculate: boolean
    canUpload: boolean
    canGenerateInsight: boolean
    productLimit: number | null
    monthlyInsightLimit: number | null
    reason:
      | null
      | 'PLAN_NOT_SELECTED'
      | 'TRIAL_ENDED'
      | 'TRIAL_ALREADY_USED'
      | 'SUBSCRIPTION_ENDED'
      | 'PAYMENT_FAILED'
  }
}

export type PaymentMethodRow = {
  id: number | string
  maskedNumber: string
  current: boolean
  status: 'ACTIVE' | 'RETIRED' | 'DELETED'
}

export type RefundAccount = {
  bank: string
  accountNumber: string
  holderName: string
}

export type Invoice = {
  invoiceId: number | string
  planId: 'seller' | 'business'
  amount: number
  currency: string
  periodStart: string
  periodEnd: string
  status: string
  paymentStatus: string | null
  paidAt: string | null
  refundStatus?:
    | 'PROCESSING'
    | 'UNKNOWN'
    | 'ACCOUNT_REQUIRED'
    | 'CANCELED'
    | 'REVIEW_REQUIRED'
    | null
  canceledAt?: string | null
  paymentMethod?: string | null
}

export type RegistrationSession = {
  sessionId: string
  customerKey: string
  state: string
  expiresAt: string
  successUrl: string
  failUrl: string
}

export type SessionResult = {
  sessionId: string
  status:
    | 'OPEN'
    | 'ISSUING'
    | 'COMPLETED'
    | 'REJECTED'
    | 'UNKNOWN'
    | 'CANCELED'
    | 'EXPIRED'
  invoiceId: number | string | null
  paymentStatus: string | null
  errorCode: string | null
}

// 변경 요청마다 붙이는 중복 방지 키(8~100자). 같은 동작을 다시 보낼 때는 같은 키를 쓴다.
export const newIdempotencyKey = () => crypto.randomUUID()

export function billingPost<T>(path: string, key: string, body?: unknown) {
  return apiRequest<T>(`/billing${path}`, {
    method: 'POST',
    headers: {
      'Idempotency-Key': key,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// 카드 발급 전의 내 등록 시도를 닫는다(server #189). 결제창을 닫았거나 실패로 돌아왔을 때만 부른다.
// 발급 중·결과 미확정이면 서버가 409로 지켜 준다.
export const cancelRegistration = (id: string) =>
  billingPost<SessionResult>(
    `/registration-sessions/${id}/cancel`,
    newIdempotencyKey(),
  )

export const getSession = (id: string) =>
  apiRequest<SessionResult>(`/billing/registration-sessions/${id}`)

export const plansQuery = {
  queryKey: ['billing', 'plans'],
  queryFn: () => apiRequest<ServerPlan[]>('/billing/plans'),
  retry: false,
}

export const usePlans = () => useQuery(plansQuery)

export const useSubscription = () =>
  useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => apiRequest<ServerSubscription>('/billing/subscription'),
    retry: false,
  })

export const usePaymentMethods = () =>
  useQuery({
    queryKey: ['billing', 'methods'],
    queryFn: () => apiRequest<PaymentMethodRow[]>('/billing/payment-methods'),
    retry: false,
  })

// ponytail: 첫 쪽(최근 결제 내역)만 본다. 내역이 길어지면 nextCursor로 더 보기를 붙인다.
export const useInvoices = () =>
  useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: () =>
      apiRequest<{ items: Invoice[]; nextCursor: string | null }>(
        '/billing/invoices',
      ),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (item) =>
          item.refundStatus === 'PROCESSING' || item.refundStatus === 'UNKNOWN',
      )
        ? 5000
        : false,
  })

// 서버 오류를 사용자 말로
export function billingErrorText(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'BILLING_DISABLED') return '결제가 아직 켜지지 않았어요'
    if (error.code === 'AUTOMATIC_PAYMENT_DISABLED')
      return '일반결제는 자동 갱신되지 않아요. 결제를 취소하려면 결제 내역의 ‘결제 취소·환불’을 이용해 주세요.'
    // 다른 결제 시도(다른 요금제·카드 바꾸기·카드 발급 중)가 아직 안 끝난 것. 승인 중과 같은 뜻이 아니다(#294)
    if (error.code === 'BILLING_IN_PROGRESS')
      return '이전 결제 시도가 아직 끝나지 않았어요. 1~2분 뒤 다시 해 주세요'
    if (
      ['REFUND_ACCOUNT_REQUIRED', 'REFUND_ACCOUNT_INVALID'].includes(error.code)
    )
      return '환불받을 은행·계좌번호·예금주명을 확인해 주세요.'
    if (error.code === 'REFUND_DETAILS_CHANGED')
      return '취소 결과를 확인하는 동안에는 환불 계좌를 바꿀 수 없어요. 결제 내역에서 결과를 확인해 주세요.'
    if (error.code === 'PLAN_PRICE_CHANGED')
      return '요금이 바뀌었어요. 새 금액을 확인하고 다시 눌러 주세요'
    if (error.code === 'BILLING_SESSION_EXPIRED')
      return '결제창 시간이 지났어요. 다시 시도해 주세요'
    return error.message
  }
  return error instanceof Error
    ? error.message
    : '결제를 진행하지 못했어요. 다시 시도해 주세요'
}

// 해지·해지 취소·다시 결제 같은 변경 요청. 같은 동작을 다시 보낼 때는 같은 키, 성공하면 새 키.
// 끝나면 결제 정보를 모두 다시 받는다.
export function useBillingMutation<T = unknown>(
  path: string,
  body?: () => unknown,
) {
  const queryClient = useQueryClient()
  const keyRef = useRef<{
    path: string
    key: string
    signature?: string
  } | null>(null)
  return useMutation({
    mutationFn: (to?: string) => {
      const target = to ?? path
      const payload = body?.()
      const signature = JSON.stringify(payload)
      if (
        keyRef.current?.path !== target ||
        keyRef.current.signature !== signature
      ) {
        keyRef.current = { path: target, key: newIdempotencyKey(), signature }
      }
      return billingPost<T>(target, keyRef.current.key, payload)
    },
    onSuccess: () => {
      keyRef.current = null
      return queryClient.invalidateQueries({ queryKey: ['billing'] })
    },
  })
}
