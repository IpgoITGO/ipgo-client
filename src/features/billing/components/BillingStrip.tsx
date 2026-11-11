import { Link, useLocation } from 'react-router-dom'

import {
  calcLock,
  dayOf,
  monthDayKo,
  paymentProblem,
  type Subscription,
} from '../model/billing'
import styles from './BillingStrip.module.css'

// 체험 끝·매달 결제 실패를 모든 화면 위 얇은 띠 한 줄로(#214, 11/5 — 카드 대신 Hiver·CommandBar 식).
// 빨강은 점 하나뿐, 행동은 글자 링크 하나. 결제 화면에서는 띄우지 않는다.
export function BillingStrip({ subscription }: { subscription: Subscription }) {
  const { pathname } = useLocation()
  if (pathname.startsWith('/checkout')) return null
  const lock = calcLock(subscription)
  const failed = paymentProblem(subscription)

  let text: React.ReactNode
  let action: { to: string; label: string }
  if (lock?.reason === 'TRIAL_ENDED') {
    text = (
      <>
        <b>체험이 끝났어요.</b> 자료는 그대로 볼 수 있어요. 새로 계산하려면
        요금제를 골라 주세요.
      </>
    )
    action = { to: '/plans', label: '요금제 고르기' }
  } else if (lock?.reason === 'SUBSCRIPTION_ENDED') {
    text = (
      <>
        <b>구독이 끝났어요.</b> 자료는 그대로 볼 수 있어요. 새로 계산하려면
        요금제를 골라 주세요.
      </>
    )
    action = { to: '/plans', label: '요금제 고르기' }
  } else if (failed) {
    text = lock ? (
      <>
        <b>결제가 안 돼서 새 계산이 멈췄어요.</b> 자료는 그대로 볼 수 있어요.
      </>
    ) : (
      <>
        <b>결제가 안 됐어요.</b>{' '}
        {failed.until && `${monthDayKo(dayOf(failed.until))}까지 `}해결하지
        않으면 새 계산이 멈춰요.
      </>
    )
    action = {
      to: '/account',
      label: '결제 확인하기',
    }
  } else {
    return null
  }

  return (
    <div className={styles.strip} role="status">
      <span aria-hidden="true" className={styles.dot} />
      <span>{text}</span>
      <Link className={styles.action} to={action.to}>
        {action.label}
      </Link>
    </div>
  )
}
