import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '../../../shared/ui/Button/Button'
import { loadSubscription, PLANS, trialDaysLeft } from '../model/billing'
import styles from './Billing.module.css'

// 요금제(#186): 카드 3장. 셀러에는 손글씨 메모 "추천!"을 붙인다(11/5 사장님 제안).
export function PlansPage() {
  const navigate = useNavigate()
  const [subscription] = useState(() => loadSubscription())
  const daysLeft = trialDaysLeft(subscription)

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1>요금제</h1>
        <p>
          {subscription.plan === 'trial'
            ? daysLeft > 0
              ? `체험이 ${daysLeft}일 남았어요. 체험 동안은 셀러와 똑같이 쓸 수 있어요.`
              : '체험이 끝났어요. 자료는 그대로 볼 수 있고, 새로 계산하려면 요금제를 골라 주세요.'
            : '요금제는 언제든 바꿀 수 있어요.'}
        </p>
      </header>

      <ul aria-label="요금제" className={styles.plans}>
        {PLANS.map((plan) => {
          const current = plan.id === subscription.plan
          return (
            <li
              className={styles.plan}
              data-recommended={plan.recommended || undefined}
              key={plan.id}
            >
              {plan.recommended && (
                <span className={styles.memo}>
                  <span aria-hidden="true">추천!</span>
                  <span className={styles.srOnly}>추천 요금제</span>
                </span>
              )}
              <h2>
                {plan.name}
                {current && <span className={styles.nowBadge}>지금</span>}
              </h2>
              <p className={styles.price}>
                {plan.price.toLocaleString('ko-KR')}
                <small>{plan.price > 0 ? '원/월' : '원'}</small>
              </p>
              <ul className={styles.features}>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {plan.id === 'trial' ? (
                <Button disabled variant="secondary">
                  {current
                    ? daysLeft > 0
                      ? `체험 중 · ${daysLeft}일 남음`
                      : '체험 끝남'
                    : '체험은 한 번만'}
                </Button>
              ) : current ? (
                <Button disabled variant="secondary">
                  쓰는 중
                </Button>
              ) : (
                <Button
                  onClick={() => navigate(`/checkout?plan=${plan.id}`)}
                  variant={plan.recommended ? 'primary' : 'secondary'}
                >
                  {plan.name}로 시작하기
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <p className={styles.footnote}>
        가격은 부가세 포함이에요. 매달 같은 날 자동으로 결제되고, 내 계정에서
        언제든 해지할 수 있어요.
      </p>
    </div>
  )
}
