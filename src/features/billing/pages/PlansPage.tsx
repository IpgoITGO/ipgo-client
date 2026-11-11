import { useNavigate } from 'react-router-dom'

import { Button } from '../../../shared/ui/Button/Button'
import {
  COMPARE,
  dayOf,
  monthDayKo,
  paymentProblem,
  PLANS,
  TRIAL_DAYS,
  trialDaysLeft,
} from '../model/billing'
import { usePlans, useSubscription } from '../model/billingApi'
import styles from './Billing.module.css'

const RING = 2 * Math.PI * 22
const md = (iso: string) =>
  monthDayKo(iso).replace('월 ', '/').replace('일', '')

// 요금제(#186): 카드 3장. 세 카드가 같은 항목을 같은 줄에 두어(COMPARE) 무엇이 다른지 한눈에,
// 추천은 이름 옆 작은 표시 + 노란 테두리(11/5 — 손그림 메모는 뺌).
// 위 상태 줄(#236): 원 D-day로 지금 상태와 체험이 끝나는 날을 먼저 보여 준다.
export function PlansPage() {
  const navigate = useNavigate()
  const { data: subscription, isError } = useSubscription()
  const serverPlans = usePlans().data
  if (!subscription) {
    return (
      <p className={styles.footnote}>
        {isError ? '결제가 아직 켜지지 않았어요' : '불러오는 중이에요'}
      </p>
    )
  }
  const daysLeft = trialDaysLeft(subscription)
  const failed = !!paymentProblem(subscription)
  const trial = subscription.planId === 'trial'
  const ended = trial && daysLeft <= 0
  const soon = trial && daysLeft > 0 && daysLeft <= 3
  const endsOn = subscription.trialEnd ? md(dayOf(subscription.trialEnd)) : ''
  const billingOn = subscription.nextChargeAt
    ? dayOf(subscription.nextChargeAt)
    : null
  const planName = PLANS.find((p) => p.id === subscription.planId)?.name

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1>요금제</h1>
        <p>요금제는 언제든 바꿀 수 있어요.</p>
      </header>

      <section
        aria-label="지금 상태"
        className={styles.status}
        data-state={ended ? 'ended' : soon ? 'soon' : undefined}
      >
        {trial && (
          <svg aria-hidden="true" className={styles.ring} viewBox="0 0 54 54">
            <circle className={styles.ringTrack} cx="27" cy="27" r="22" />
            {!ended && (
              <circle
                className={styles.ringBar}
                cx="27"
                cy="27"
                r="22"
                strokeDasharray={RING}
                strokeDashoffset={RING * (1 - daysLeft / TRIAL_DAYS)}
                transform="rotate(-90 27 27)"
              />
            )}
            <text x="27" y="31">
              {ended ? '끝' : `D-${daysLeft}`}
            </text>
          </svg>
        )}
        <p>
          {ended ? (
            <>
              <b>체험이 끝났어요</b>
              <span>자료는 그대로 볼 수 있어요</span>
            </>
          ) : soon ? (
            <>
              <b>체험이 {daysLeft}일 남았어요</b>
              <span>{endsOn}에 새 계산이 멈춰요</span>
            </>
          ) : trial ? (
            <>
              <b>14일 체험 쓰는 중</b>
              <span>{endsOn}까지 셀러와 똑같이 써요</span>
            </>
          ) : (
            <b>
              {planName} 쓰는 중{billingOn && ` · 다음 결제 ${md(billingOn)}`}
            </b>
          )}
        </p>
        {soon && (
          <Button onClick={() => navigate('/checkout?plan=seller')}>
            셀러로 이어 쓰기
          </Button>
        )}
        {ended && (
          <Button
            onClick={() =>
              document
                .getElementById('plan-cards')
                ?.scrollIntoView({ behavior: 'smooth' })
            }
            variant="secondary"
          >
            요금제 고르기
          </Button>
        )}
      </section>

      <ul
        aria-label="요금제"
        className={styles.plans}
        data-rise=""
        id="plan-cards"
      >
        {PLANS.map((plan) => {
          const current = plan.id === subscription.planId
          // 가격은 서버 요금제 값이 기준(서버가 바꾸면 그대로 따라간다)
          const price =
            serverPlans?.find((p) => p.planId === plan.id)?.amount ?? plan.price
          return (
            <li
              className={styles.plan}
              data-current={(current && !ended) || undefined}
              data-ended={(current && ended) || undefined}
              data-plan={plan.id}
              data-recommended={plan.recommended || undefined}
              data-sunset={(plan.id === 'seller' && ended) || undefined}
              key={plan.id}
            >
              {current && !ended && (
                <span className={styles.ribbon}>지금 쓰는 중</span>
              )}
              {current && ended && (
                <span className={styles.endStamp}>체험 끝</span>
              )}
              <h2>
                {plan.name}
                {plan.recommended && (
                  <span className={styles.recoBadge}>
                    추천<span className={styles.srOnly}> 요금제</span>
                  </span>
                )}
                {current && failed && (
                  <span className={styles.nowBadge} data-warn>
                    결제 안 됨
                  </span>
                )}
              </h2>
              <p className={styles.price}>
                {price.toLocaleString('ko-KR')}
                <small>{price > 0 ? '원/월' : '원'}</small>
              </p>
              {current && trial && !ended && (
                <div className={styles.days}>
                  <span
                    aria-hidden="true"
                    className={styles.dayCells}
                    data-soon={soon || undefined}
                  >
                    {Array.from({ length: TRIAL_DAYS }, (_, i) => (
                      <i
                        data-used={i < TRIAL_DAYS - daysLeft || undefined}
                        key={i}
                      />
                    ))}
                  </span>
                  <small data-soon={soon || undefined}>{daysLeft}일 남음</small>
                </div>
              )}
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
                <Button onClick={() => navigate('/account')}>
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
