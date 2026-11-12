import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { billingErrorText } from '../model/billingApi'
import {
  confirmPayment,
  getPayment,
  type PaymentResult,
} from '../model/normalPayment'
import styles from './Billing.module.css'

export function NormalReturnPage({ failed = false }: { failed?: boolean }) {
  const cache = useQueryClient()
  const [input] = useState(() => {
    const p = new URLSearchParams(location.search)
    return {
      orderId: p.get('orderId'),
      paymentKey: p.get('paymentKey'),
      amount: p.get('amount'),
    }
  })
  const request = useRef<Promise<PaymentResult> | null>(null)
  const [result, setResult] = useState<PaymentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    history.replaceState(history.state, '', location.pathname)
    if (failed) return
    let active = true
    const { orderId, paymentKey, amount } = input
    if (
      !orderId ||
      !paymentKey ||
      !amount ||
      !/^\d+$/.test(amount) ||
      !Number.isSafeInteger(Number(amount))
    )
      return
    request.current ??= (async () => {
      try {
        return await confirmPayment(orderId, paymentKey, Number(amount))
      } catch {
        // A failed HTTP response does not prove approval failed. Only query this order.
        return await getPayment(orderId)
      }
    })()
    void request.current
      .then(async (value) => {
        if (active) setResult(value)
        await cache.invalidateQueries({ queryKey: ['billing'] })
      })
      .catch((e) => {
        if (active) setError(billingErrorText(e))
      })
    return () => {
      active = false
    }
  }, [input, failed, cache])
  const valid = !!(
    input.orderId &&
    input.paymentKey &&
    input.amount &&
    /^\d+$/.test(input.amount) &&
    Number.isSafeInteger(Number(input.amount))
  )
  return (
    <div className={styles.column}>
      <h1>
        {failed
          ? '결제를 완료하지 않았어요'
          : result?.status === 'PAID'
            ? '결제가 완료됐어요'
            : '결제 상태 확인'}
      </h1>
      {failed ? (
        <p>
          다시 진행하려면 요금제를 선택해주세요. 실제 상태는 내 계정에서 확인할
          수 있어요.
        </p>
      ) : !valid ? (
        <p role="alert">
          결제 확인 정보가 없어요. 내 계정에서 상태를 확인해주세요.
        </p>
      ) : error ? (
        <p role="alert">
          {error} 결제 여부를 확인하기 전에는 새 결제를 시도하지 마세요.
        </p>
      ) : result?.status === 'PAID' ? (
        <p>
          결제 완료일부터 한 달 동안 이용해요. 자동으로 다시 청구하지 않아요.
        </p>
      ) : result?.status === 'PENDING' ? (
        <p>
          입금을 기다리고 있어요. 가상계좌 입금이 확인되면 이용권이 시작돼요.
        </p>
      ) : result?.status === 'FAILED' || result?.status === 'CANCELED' ? (
        <p>이 주문의 결제가 완료되지 않았어요.</p>
      ) : (
        <p role="status">
          결과를 확인하고 있어요. 내 계정에서 상태를 다시 확인할 수 있어요.
        </p>
      )}
      <Link to="/account">내 계정에서 결제 상태 확인</Link>
      <Link to="/plans">요금제 보기</Link>
    </div>
  )
}
