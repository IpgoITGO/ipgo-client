import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../../../auth/model/useAuth'
import { useActionLock } from '../../../shared/hooks/useActionLock'
import { Button } from '../../../shared/ui/Button/Button'
import { type PlanId, planOf } from '../model/billing'
import {
  billingErrorText,
  usePlans,
  useSubscription,
} from '../model/billingApi'
import { useCardRegistration } from '../model/payment'
import styles from './Billing.module.css'

const STEPS = ['요금제', '결제', '완료'] as const

export function Steps({ at }: { at: 1 | 2 }) {
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

// 결제(#186, #294): 한 줄로 위에서 아래로 — 금액 → 결제 수단 → 버튼. 노랑은 버튼 하나와 금액 밑줄만.
// 버튼을 누르면 서버에 카드 등록을 열고 결제사 창으로 간다. 결과는 /billing/auth/* 화면이 이어서 보여 준다.
export function CheckoutPage() {
  const [params] = useSearchParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const planId = params.get('plan') as PlanId | null
  // 유료 요금제만 결제한다. 주소가 틀리면 요금제 화면으로 돌려보낸다.
  const plan =
    planId === 'seller' || planId === 'business' ? planOf(planId) : null
  const { data: before } = useSubscription()
  const serverPlan = usePlans().data?.find((p) => p.planId === planId)
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closed, setClosed] = useState(false)
  const start = useCardRegistration({ email: user?.email, name: user?.name })
  // 누르는 즉시 잠가 두 번 결제되지 않게 한다.
  const { isPending, run: pay } = useActionLock(async () => {
    if (!plan) return
    setError(null)
    setClosed(false)
    try {
      if ((await start('START_SUBSCRIPTION', plan.id)) === 'cancelled') {
        setClosed(true)
      }
    } catch (e) {
      setError(billingErrorText(e))
      void queryClient.invalidateQueries({
        queryKey: ['billing', 'subscription'],
      })
    }
  })

  if (!plan) return <Navigate replace to="/plans" />
  const amount = serverPlan ? serverPlan.amount.toLocaleString('ko-KR') : '—'
  // 매달 결제일 = 오늘 날짜(정기결제 고지에 금액·주기를 적는다)
  const payDay = new Date().getDate()
  const wasPlan = before && before.planId !== 'trial' ? before.planId : null

  return (
    <div className={styles.column}>
      <Steps at={1} />
      <h1 className={styles.srOnly}>결제</h1>

      {error && (
        <div className={styles.safe} role="alert">
          <span aria-hidden="true">✓</span>
          <span>돈은 빠져나가지 않았어요. {error}</span>
        </div>
      )}
      {closed && (
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
          {wasPlan
            ? `지금 ${planOf(wasPlan).name} 요금제에서 바꿔요`
            : '체험이 끝나도 자료는 그대로 남아요'}
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
        <label className={styles.radio}>
          <input checked name="pay-method" readOnly type="radio" value="card" />
          신용·체크카드
          <span className={styles.via}>토스페이먼츠</span>
        </label>
        <span className={styles.hint}>
          카카오페이 등 다른 수단은 준비 중이에요
        </span>
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
        disabled={!agreed || !serverPlan}
        loading={isPending}
        loadingLabel="결제창 여는 중"
        onClick={() => void pay()}
      >
        {`${amount}원 결제하기`}
      </Button>
      {!agreed && (
        <span className={styles.hintCenter}>
          위의 자동 결제에 동의하면 누를 수 있어요
        </span>
      )}
      <Link className={styles.back} to="/plans">
        ← 요금제 다시 고르기
      </Link>
      <span className={styles.hintCenter}>
        지금은 테스트라 실제로 돈이 나가지 않아요
      </span>
    </div>
  )
}
