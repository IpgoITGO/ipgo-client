import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiRequest } from '../../../shared/api/client'
import { Button } from '../../../shared/ui/Button/Button'
import { useActionLock } from '../../../shared/hooks/useActionLock'
import { billingErrorText } from '../model/billingApi'
import { getPayment, type PaymentResult } from '../model/normalPayment'

export function PendingPayments() {
  const cache = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const orders = useQuery({
    queryKey: ['billing', 'pending-payments'],
    queryFn: () => apiRequest<PaymentResult[]>('/billing/payments'),
    retry: false,
  })
  const { isPending, run } = useActionLock(async () => {
    setError(null)
    try {
      for (const order of orders.data ?? []) await getPayment(order.orderId)
      await cache.invalidateQueries({ queryKey: ['billing'] })
    } catch (e) {
      setError(billingErrorText(e))
    }
  })
  if (orders.isError)
    return (
      <p role="alert">
        진행 중인 결제 정보를 불러오지 못했어요. 잠시 후 다시 확인해주세요.
      </p>
    )
  if (!orders.data?.length) return null
  return (
    <section aria-label="진행 중인 결제">
      <h3>진행 중인 결제</h3>
      {orders.data.map((o) => (
        <p key={o.orderId}>
          {o.refundStatus === 'ACCOUNT_REQUIRED'
            ? '아래 결제 내역에서 환불 계좌를 입력해 주세요'
            : o.refundStatus
              ? '취소 결과 확인 중'
              : o.status === 'PENDING'
                ? '입금 대기 중'
                : o.status === 'REVIEW_REQUIRED'
                  ? '결제 확인이 필요해요. 관리자에게 문의해주세요.'
                  : '결제 결과 확인 중'}
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
      <Button loading={isPending} onClick={() => void run()}>
        결제 상태 다시 확인
      </Button>
    </section>
  )
}
