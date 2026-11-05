import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { useActionLock } from '../../../shared/hooks/useActionLock'
import { Button } from '../../../shared/ui/Button/Button'
import {
  loadSubscription,
  METHOD_CHOICE,
  METHOD_LABEL,
  monthDayKo,
  nextBillingOn,
  type PayMethod,
  type PlanId,
  planOf,
  type Subscription,
  subscribe,
} from '../model/billing'
import { type PayResult, reasonText, requestPayment } from '../model/payment'
import styles from './Billing.module.css'

const STEPS = ['요금제', '결제', '완료'] as const

function Steps({ at }: { at: 1 | 2 }) {
  return (
    <ol aria-label="결제 순서" className={styles.steps}>
      {STEPS.map((label, index) => {
        const state = index < at ? 'done' : index === at ? 'now' : 'next'
        return (
          <li
            aria-current={state === 'now' ? 'step' : undefined}
            data-state={state}
            key={label}
          >
            <b aria-hidden="true">{state === 'done' ? '✓' : index + 1}</b>
            {label}
          </li>
        )
      })}
    </ol>
  )
}

// 결제(#186): 한 줄로 위에서 아래로 — 금액 → 결제 수단 → 버튼. 노랑은 버튼 하나와 금액 밑줄만.
export function CheckoutPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const planId = params.get('plan') as PlanId | null
  // 유료 요금제만 결제한다. 주소가 틀리면 요금제 화면으로 돌려보낸다.
  const plan =
    planId === 'seller' || planId === 'business' ? planOf(planId) : null
  const [before] = useState(() => loadSubscription())
  const [method, setMethod] = useState<PayMethod>('card')
  const [agreed, setAgreed] = useState(false)
  const [result, setResult] = useState<PayResult | null>(null)
  const [after, setAfter] = useState<Subscription | null>(null)
  // 누르는 즉시 잠가 두 번 결제되지 않게 한다.
  const { isPending, run: pay } = useActionLock(async () => {
    if (!plan) return
    setResult(null)
    const next = await requestPayment(plan.id, method)
    if (next.status === 'paid') setAfter(subscribe(before, plan.id, method))
    setResult(next)
  })

  if (!plan) return <Navigate replace to="/plans" />
  const was = planOf(before.plan)
  const amount = plan.price.toLocaleString('ko-KR')
  // 매달 결제일 = 오늘 날짜(정기결제 고지에 금액·주기를 적는다)
  const payDay = new Date().getDate()
  const retry = params.get('retry') === '1' && before.renewalFailed

  if (result?.status === 'paid' && after) {
    const paid = after.history[0]
    return (
      <div className={styles.column}>
        <Steps at={2} />
        <div className={styles.done} role="status">
          <span aria-hidden="true" className={styles.ring}>
            ✓
          </span>
          <h1>{plan.name} 요금제를 시작했어요</h1>
        </div>
        <section aria-label="달라진 것" className={styles.receipt}>
          <dl className={styles.changes}>
            <div>
              <dt>관리 상품</dt>
              <dd>
                {was.id !== plan.id && was.products !== plan.products && (
                  <s>{was.products?.toLocaleString('ko-KR')}개</s>
                )}{' '}
                <b>{plan.products?.toLocaleString('ko-KR')}개</b>
              </dd>
            </div>
            <div>
              <dt>AI 인사이트</dt>
              <dd>
                {was.insights !== plan.insights && <s>{was.insights}</s>}{' '}
                <b>{plan.insights}</b>
              </dd>
            </div>
            <div>
              <dt>다음 결제</dt>
              <dd>
                <b>{monthDayKo(nextBillingOn(after) ?? paid.paidOn)}</b>
              </dd>
            </div>
          </dl>
          <p className={styles.paidLine}>
            <span>
              {monthDayKo(paid.paidOn)} · {METHOD_LABEL[method]}
            </span>
            <b>{amount}원</b>
          </p>
        </section>
        <Button onClick={() => navigate('/settings')}>
          보관 비용 넣으러 가기
        </Button>
        <Button onClick={() => navigate('/dashboard')} variant="secondary">
          대시보드로
        </Button>
      </div>
    )
  }

  const failed = result?.status === 'failed' ? result : null

  return (
    <div className={styles.column}>
      <Steps at={1} />
      <h1 className={styles.srOnly}>결제</h1>

      {failed && (
        <div className={styles.safe} role="alert">
          <span aria-hidden="true">✓</span>
          <span>
            돈은 빠져나가지 않았어요. {reasonText(failed.reason)}. 다른 카드나
            카카오페이로 다시 해 주세요.
          </span>
        </div>
      )}
      {result?.status === 'cancelled' && (
        <p className={styles.info} role="status">
          결제를 멈췄어요. 고른 요금제는 그대로 있어요.
        </p>
      )}

      <section aria-label="결제 금액" className={styles.block}>
        <span className={styles.label}>
          {plan.name} 요금제 · 매달 자동 결제
        </span>
        <p className={styles.amount}>
          <span className={styles.mark}>{amount}</span>
          <small>원</small>
        </p>
        <span className={styles.hint}>
          {retry
            ? `${monthDayKo(before.renewalFailed!.on)}에 안 된 결제를 다시 해요`
            : before.plan === 'trial'
              ? '체험이 끝나도 자료는 그대로 남아요'
              : `지금 ${planOf(before.plan).name} 요금제에서 바꿔요`}
          {' · '}언제든 내 계정에서 해지
        </span>
        <dl className={styles.dues}>
          <div>
            <dt>오늘 결제</dt>
            <dd>{amount}원</dd>
          </div>
          <div>
            <dt>다음부터</dt>
            <dd>
              매달 {payDay}일 {amount}원
            </dd>
          </div>
        </dl>
      </section>

      <fieldset className={styles.block}>
        <legend className={styles.label}>결제 수단</legend>
        {(Object.keys(METHOD_LABEL) as PayMethod[]).map((key) => (
          <label className={styles.radio} key={key}>
            <input
              checked={method === key}
              name="pay-method"
              onChange={() => setMethod(key)}
              type="radio"
              value={key}
            />
            {METHOD_CHOICE[key].name}
            <span className={styles.via}>{METHOD_CHOICE[key].via}</span>
          </label>
        ))}
      </fieldset>

      <label className={styles.agree}>
        <input
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          type="checkbox"
        />
        <span>
          매달 {payDay}일에 {amount}원이 자동으로 결제되는 것에 동의해요
          <small className={styles.agreeSub}>
            해지는 내 계정에서 언제든, 해지해도 다음 결제일까지 쓸 수 있어요
          </small>
        </span>
      </label>

      <Button
        className={styles.payButton}
        disabled={!agreed}
        loading={isPending}
        loadingLabel="결제창 여는 중"
        onClick={() => void pay()}
      >
        {failed
          ? `다른 수단으로 ${amount}원 다시 결제`
          : `${amount}원 결제하기`}
      </Button>
      {!agreed && (
        <span className={styles.hintCenter}>
          위의 자동 결제에 동의하면 누를 수 있어요
        </span>
      )}
      {failed ? (
        <Button onClick={() => navigate('/dashboard')} variant="text">
          나중에 할게요
        </Button>
      ) : (
        <Link className={styles.back} to="/plans">
          ← 요금제 다시 고르기
        </Link>
      )}
      <span className={styles.hintCenter}>
        지금은 테스트라 실제로 돈이 나가지 않아요
      </span>
    </div>
  )
}
