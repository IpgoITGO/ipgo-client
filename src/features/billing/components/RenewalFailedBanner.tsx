import { Link } from 'react-router-dom'

import { monthDayKo, type Subscription } from '../model/billing'
import { reasonText } from '../model/payment'
import styles from './RenewalFailedBanner.module.css'

// 매달 결제가 안 됐을 때 띠(11/5 사장님 — 예외 상황은 항상 보이게). 무엇이 왜 안 됐고, 무엇을 하면 되는지 한 줄씩.
export function RenewalFailedBanner({
  subscription,
}: {
  subscription: Subscription
}) {
  const failed = subscription.renewalFailed
  if (!failed || subscription.plan === 'trial') return null
  return (
    <div className={styles.banner} role="alert">
      <p>
        <b>{monthDayKo(failed.on)} 결제가 안 됐어요.</b>{' '}
        {reasonText(failed.reason)}.
      </p>
      <p className={styles.sub}>
        7일 안에 다시 결제하지 않으면 새 계산이 멈추고, 자료는 그대로 볼 수
        있어요.
      </p>
      <Link
        className={styles.action}
        to={`/checkout?plan=${subscription.plan}&retry=1`}
      >
        결제 수단 바꾸고 다시 결제
      </Link>
    </div>
  )
}
