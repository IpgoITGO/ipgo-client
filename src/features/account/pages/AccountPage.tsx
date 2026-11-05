import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useAuth } from '../../../auth/model/useAuth'
import { env } from '../../../shared/config/env'
import { Button } from '../../../shared/ui/Button/Button'
import {
  calcLock,
  changeMethod,
  loadSubscription,
  markRenewalFailed,
  METHOD_CHOICE,
  METHOD_LABEL,
  monthDayKo,
  nextBillingOn,
  type PayMethod,
  planOf,
  renewalDeadline,
  setCancel,
  TRIAL_DAYS,
  trialDaysLeft,
} from '../../billing/model/billing'
import { getProductSettings } from '../../settings/model/inboundSettingsApi'
import styles from './AccountPage.module.css'

// 한도의 80%를 넘으면 막대를 노랗게
const NEAR = 0.8

// 내 계정(#187): 들어오는 이유 대부분이 "얼마나 썼나·언제 결제되나"라 그걸 맨 위에,
// 결제 수단 → 결제 내역 → 계정 → 맨 아래 작은 글씨로 해지(11/5 사장님 승인 시안).
export function AccountPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  // 가짜 서버로 볼 때만: ?renewal=LIMIT_EXCEEDED 처럼 붙이면 매달 결제가 안 된 화면을 본다.
  const [subscription, setSubscription] = useState(() => {
    const loaded = loadSubscription()
    const mock = env.enableMsw ? params.get('renewal') : null
    return mock && loaded.plan !== 'trial'
      ? markRenewalFailed(loaded, mock)
      : loaded
  })
  const [editMethod, setEditMethod] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const products = useQuery({
    queryKey: ['products', 'count'],
    queryFn: getProductSettings,
  })
  const plan = planOf(subscription.plan)
  const trial = subscription.plan === 'trial'
  const nextOn = nextBillingOn(subscription)
  const used = products.data?.total
  const limit = plan.products
  const ratio = used != null && limit ? Math.min(used / limit, 1) : 0
  const daysUsed = trial ? TRIAL_DAYS - trialDaysLeft(subscription) : 0
  // 체험 끝·매달 결제 실패는 따로 띠를 두지 않고 요금제 칸의 "상태" 줄로(#214, Google Workspace 식)
  const lock = calcLock(subscription)
  const failed = trial ? null : subscription.renewalFailed
  const status =
    lock?.reason === 'TRIAL_ENDED'
      ? { text: '체험 끝남', to: '/plans', label: '요금제 고르기' }
      : failed
        ? {
            text: lock
              ? '결제 안 됨 · 새 계산 멈춤'
              : `결제 안 됨 (${monthDayKo(failed.on)}) · ${monthDayKo(renewalDeadline(failed.on))}까지`,
            to: `/checkout?plan=${subscription.plan}&retry=1`,
            label: '다시 결제',
          }
        : null

  return (
    <div className={styles.page}>
      <h1>내 계정</h1>

      <section aria-labelledby="plan-title" className={styles.block}>
        <div className={styles.row}>
          <h2 id="plan-title">지금 요금제</h2>
          <span className={styles.badge}>{plan.name}</span>
        </div>
        {status && (
          <p className={styles.row}>
            <span>상태</span>
            <span className={styles.status}>
              <i aria-hidden="true" />
              <b>{status.text}</b>
              <Link to={status.to}>{status.label}</Link>
            </span>
          </p>
        )}
        {trial ? (
          <div className={styles.meterRow}>
            <p className={styles.row}>
              <span>체험</span>
              <b>
                {TRIAL_DAYS}일 중 {daysUsed}일 씀 ·{' '}
                {trialDaysLeft(subscription)}일 남음
              </b>
            </p>
            <div
              aria-label={`체험 ${TRIAL_DAYS}일 중 ${daysUsed}일 씀`}
              aria-valuemax={TRIAL_DAYS}
              aria-valuemin={0}
              aria-valuenow={daysUsed}
              className={styles.meter}
              role="meter"
            >
              <span style={{ width: `${(daysUsed / TRIAL_DAYS) * 100}%` }} />
            </div>
          </div>
        ) : failed ? null : (
          // 결제가 안 됐으면 지난 날짜가 "다음 결제"로 보이지 않게 상태 줄만 둔다
          <p className={styles.row}>
            <span>다음 결제</span>
            <b>
              {subscription.cancelOn
                ? `${monthDayKo(subscription.cancelOn)}에 끝나요`
                : `${monthDayKo(nextOn!)} · ${plan.price.toLocaleString('ko-KR')}원`}
            </b>
          </p>
        )}
        <div className={styles.meterRow}>
          <p className={styles.row}>
            <span>관리 상품</span>
            <b>
              {used == null ? '—' : used.toLocaleString('ko-KR')} /{' '}
              {limit?.toLocaleString('ko-KR')}개
            </b>
          </p>
          <div
            aria-label={`관리 상품 ${used ?? 0}개 / ${limit}개`}
            aria-valuemax={limit ?? 0}
            aria-valuemin={0}
            aria-valuenow={used ?? 0}
            className={styles.meter}
            data-near={ratio >= NEAR || undefined}
            role="meter"
          >
            <span style={{ width: `${ratio * 100}%` }} />
          </div>
        </div>
        <p className={styles.row}>
          <span>AI 인사이트</span>
          <b>{plan.insights}</b>
        </p>
        <Link className={styles.linkButton} to="/plans">
          요금제 바꾸기
        </Link>
      </section>

      <section aria-labelledby="method-title" className={styles.block}>
        <div className={styles.row}>
          <h2 id="method-title">결제 수단</h2>
          {subscription.method && !editMethod && (
            <button
              className={styles.textButton}
              onClick={() => setEditMethod(true)}
              type="button"
            >
              바꾸기
            </button>
          )}
        </div>
        {!subscription.method ? (
          <p className={styles.value}>아직 없어요 · 체험은 카드 없이 써요</p>
        ) : editMethod ? (
          <fieldset className={styles.methods}>
            <legend className={styles.srOnly}>
              다음 결제부터 쓸 결제 수단
            </legend>
            {(Object.keys(METHOD_CHOICE) as PayMethod[]).map((key) => (
              <button
                aria-pressed={subscription.method === key}
                className={styles.method}
                key={key}
                onClick={() => {
                  setSubscription(changeMethod(subscription, key))
                  setEditMethod(false)
                }}
                type="button"
              >
                {METHOD_CHOICE[key].name}
                <span>{METHOD_CHOICE[key].via}</span>
              </button>
            ))}
            <p className={styles.note}>다음 결제부터 이 수단으로 결제돼요.</p>
          </fieldset>
        ) : (
          <p className={styles.value}>
            {METHOD_CHOICE[subscription.method].name}
            {subscription.method === 'card' && subscription.cardLast4 && (
              <span className={styles.card}>
                {' '}
                •••• {subscription.cardLast4}
              </span>
            )}
            <span className={styles.via}>
              {METHOD_CHOICE[subscription.method].via}
            </span>
          </p>
        )}
      </section>

      <section aria-labelledby="history-title" className={styles.block}>
        <h2 id="history-title">결제 내역</h2>
        <table className={styles.history}>
          <tbody>
            {subscription.history.map((item, index) => (
              <tr key={`${item.paidOn}-${index}`}>
                <td>{monthDayKo(item.paidOn)}</td>
                <td>
                  {item.plan === 'trial'
                    ? '14일 체험 시작'
                    : `${planOf(item.plan).name}${item.method ? ` · ${METHOD_LABEL[item.method]}` : ''}`}
                </td>
                <td>{item.amount.toLocaleString('ko-KR')}원</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="me-title" className={styles.block}>
        <h2 id="me-title">계정</h2>
        <p className={styles.row}>
          <span>이름 · 회사</span>
          <b>
            {user?.name} · {user?.companyName}
          </b>
        </p>
        <p className={styles.row}>
          <span>이메일</span>
          <b>{user?.email}</b>
        </p>
        <p className={styles.note}>비밀번호 바꾸기는 준비 중이에요.</p>
      </section>

      {!trial &&
        (subscription.cancelOn ? (
          <p className={styles.cancelLine}>
            {monthDayKo(subscription.cancelOn)}까지 쓰고 끝나요.{' '}
            <button
              className={styles.textButton}
              onClick={() => setSubscription(setCancel(subscription, false))}
              type="button"
            >
              해지 취소
            </button>
          </p>
        ) : confirmCancel ? (
          <div className={styles.confirm} role="group" aria-label="구독 해지">
            <p>
              {monthDayKo(nextOn!)}까지는 지금처럼 쓰고, 그 뒤로는 자료를 보기만
              할 수 있어요.
            </p>
            <div className={styles.confirmActions}>
              <Button onClick={() => setConfirmCancel(false)} variant="text">
                그대로 쓸게요
              </Button>
              <Button
                onClick={() => {
                  setSubscription(setCancel(subscription, true))
                  setConfirmCancel(false)
                }}
                variant="secondary"
              >
                해지하기
              </Button>
            </div>
          </div>
        ) : (
          <button
            className={styles.textButton}
            onClick={() => setConfirmCancel(true)}
            type="button"
          >
            구독 해지
          </button>
        ))}
    </div>
  )
}
