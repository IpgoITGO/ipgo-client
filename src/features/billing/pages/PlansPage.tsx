import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '../../../shared/ui/Button/Button'
import {
  COMPARE,
  loadSubscription,
  PLANS,
  trialDaysLeft,
} from '../model/billing'
import styles from './Billing.module.css'

// 요금제(#186): 카드 3장. 세 카드가 같은 항목을 같은 줄에 두어(COMPARE) 무엇이 다른지 한눈에,
// 추천은 이름 옆 작은 표시 + 노란 테두리(11/5 사장님 — 손그림 메모는 뺌).
export function PlansPage() {
  const navigate = useNavigate()
  const [subscription] = useState(() => loadSubscription())
  const daysLeft = trialDaysLeft(subscription)
  const failed = !!subscription.renewalFailed && subscription.plan !== 'trial'

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
              data-plan={plan.id}
              data-recommended={plan.recommended || undefined}
              key={plan.id}
            >
              <h2>
                {plan.name}
                {plan.recommended && (
                  <span className={styles.recoBadge}>
                    추천<span className={styles.srOnly}> 요금제</span>
                  </span>
                )}
                {current && (
                  <span
                    className={styles.nowBadge}
                    data-warn={failed || undefined}
                  >
                    {failed
                      ? '결제 안 됨'
                      : plan.id === 'trial' && daysLeft <= 0
                        ? '끝남'
                        : '지금'}
                  </span>
                )}
              </h2>
              <p className={styles.price}>
                {plan.price.toLocaleString('ko-KR')}
                <small>{plan.price > 0 ? '원/월' : '원'}</small>
              </p>
              <p className={styles.planNote}>{plan.note}</p>
              <dl className={styles.compare}>
                {COMPARE.map((row) => {
                  const value = row.value(plan)
                  return (
                    <div
                      data-highlight={row.highlight || undefined}
                      key={row.label}
                    >
                      <dt>{row.label}</dt>
                      <dd
                        data-after={
                          row.highlight
                            ? plan.id === 'trial'
                              ? 'stop'
                              : 'go'
                            : undefined
                        }
                        data-none={value == null || undefined}
                      >
                        {value ?? '—'}
                      </dd>
                    </div>
                  )
                })}
              </dl>
              {plan.id === 'trial' ? (
                <Button disabled variant="secondary">
                  {current
                    ? daysLeft > 0
                      ? `체험 중 · ${daysLeft}일 남음`
                      : '체험 끝남'
                    : '체험은 한 번만'}
                </Button>
              ) : current && failed ? (
                <Button
                  onClick={() => navigate(`/checkout?plan=${plan.id}&retry=1`)}
                >
                  다시 결제하기
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
