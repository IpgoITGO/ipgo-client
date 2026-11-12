import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { env } from '../../../shared/config/env'
import { Button } from '../../../shared/ui/Button/Button'
import { useActionLock } from '../../../shared/hooks/useActionLock'
import { billingErrorText, type ServerPlan } from '../model/billingApi'
import { loadToss } from '../model/cardWindow'
import { createPayment, type PaymentOrder } from '../model/normalPayment'
import { planOf } from '../model/billing'
import styles from './Billing.module.css'

type Widget = {
  setAmount: (amount: { currency: string; value: number }) => Promise<void>
  renderPaymentMethods: (options: {
    selector: string
    variantKey: string
  }) => Promise<{ destroy: () => void }>
  renderAgreement: (options: {
    selector: string
    variantKey: string
  }) => Promise<{ destroy: () => void }>
  requestPayment: (options: {
    orderId: string
    orderName: string
    successUrl: string
    failUrl: string
  }) => Promise<void>
}
type SDK = {
  TossPayments: (key: string) => {
    widgets: (options: { customerKey: string }) => Widget
  }
}

export function NormalCheckoutPage({ plan }: { plan: ServerPlan }) {
  const [agreed, setAgreed] = useState(false)
  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const widget = useRef<Widget | null>(null)
  const name = planOf(plan.planId).name
  useEffect(() => {
    if (!order) return
    let disposed = false
    const destroyers: (() => void)[] = []
    const cleanup = () => {
      for (const destroy of destroyers.splice(0)) destroy()
    }
    void (async () => {
      try {
        if (!env.tossClientKey.startsWith('test_gck_'))
          throw new Error('일반결제용 테스트 키를 준비 중이에요')
        await loadToss()
        if (disposed) return
        const sdk = (window as unknown as SDK)
          .TossPayments(env.tossClientKey)
          .widgets({ customerKey: order.customerKey })
        await sdk.setAmount({ currency: 'KRW', value: order.amount })
        if (disposed) return
        const methods = await sdk.renderPaymentMethods({
          selector: '#normal-payment-methods',
          variantKey: 'DEFAULT',
        })
        destroyers.push(() => methods.destroy())
        if (disposed) {
          cleanup()
          return
        }
        const agreement = await sdk.renderAgreement({
          selector: '#normal-payment-agreement',
          variantKey: 'AGREEMENT',
        })
        destroyers.push(() => agreement.destroy())
        if (disposed) {
          cleanup()
          return
        }
        widget.current = sdk
        setReady(true)
      } catch (e) {
        if (!disposed) setError(billingErrorText(e))
      }
    })()
    return () => {
      disposed = true
      widget.current = null
      cleanup()
    }
  }, [order])
  const { isPending, run } = useActionLock(async () => {
    setError(null)
    try {
      if (!order) {
        setOrder(await createPayment(plan))
        return
      }
      if (!ready || !widget.current) return
      await widget.current.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: order.successUrl,
        failUrl: order.failUrl,
      })
    } catch (e) {
      setError(
        (e as { code?: string }).code === 'USER_CANCEL'
          ? '결제를 중단했어요. 원할 때 다시 진행할 수 있어요.'
          : billingErrorText(e),
      )
    }
  })
  return (
    <div className={styles.column}>
      <h1>{name} 1개월 이용권</h1>
      <p className={styles.amount}>{plan.amount.toLocaleString('ko-KR')}원</p>
      <p>
        한 번 결제하면 결제 완료일부터 한 달 동안 이용해요. 만료 후에는 직접
        다시 결제해주세요. 자동 청구는 없어요.
      </p>
      <p>테스트 결제이며 실제로 돈이 나가지 않아요.</p>
      {error && <p role="alert">{error}</p>}
      {!order && (
        <label className={styles.agree}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          1개월 이용기간과 결제 금액을 확인했어요
        </label>
      )}
      <div id="normal-payment-methods" />
      <div id="normal-payment-agreement" />
      <Button
        disabled={!agreed || (!!order && !ready)}
        loading={isPending}
        onClick={() => void run()}
      >
        {order
          ? `${order.amount.toLocaleString('ko-KR')}원 결제하기`
          : '결제 수단 불러오기'}
      </Button>
      <p className={styles.hint}>
        사용 가능한 결제 수단은 토스 화면에 표시돼요. 가상계좌는 입금이 확인된
        뒤 이용권이 시작돼요.
      </p>
      <Link to="/account">결제 상태 확인</Link>
      <Link to="/plans">요금제 다시 고르기</Link>
    </div>
  )
}
