import { apiRequest } from '../../../shared/api/client'
import { billingPost, newIdempotencyKey, type ServerPlan } from './billingApi'

export type PaymentOrder = {
  orderId: string
  customerKey: string
  amount: number
  orderName: string
  successUrl: string
  failUrl: string
  expiresAt: string
}
export type PaymentResult = {
  orderId: string
  invoiceId: string
  status:
    | 'OPEN'
    | 'CONFIRMING'
    | 'PENDING'
    | 'PAID'
    | 'FAILED'
    | 'UNKNOWN'
    | 'REVIEW_REQUIRED'
    | 'CANCELED'
  refundStatus: string | null
  canceledAt: string | null
}
export const createPayment = (plan: ServerPlan) =>
  billingPost<PaymentOrder>('/payments', newIdempotencyKey(), {
    planId: plan.planId,
    priceVersion: plan.priceVersion,
    consentVersion: plan.consentVersion,
  })
export const getPayment = (id: string) =>
  apiRequest<PaymentResult>(`/billing/payments/${encodeURIComponent(id)}`)
export const confirmPayment = (
  id: string,
  paymentKey: string,
  amount: number,
) =>
  apiRequest<PaymentResult>(
    `/billing/payments/${encodeURIComponent(id)}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, amount }),
    },
  )
