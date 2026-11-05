import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../../auth/model/useAuth'
import { Button } from '../../../shared/ui/Button/Button'
import {
  loadSubscription,
  METHOD_LABEL,
  monthDayKo,
  nextBillingOn,
  planOf,
  setCancel,
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
  const [subscription, setSubscription] = useState(() => loadSubscription())
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

  return (
    <div className={styles.page}>
      <h1>내 계정</h1>

      <section aria-labelledby="plan-title" className={styles.block}>
        <div className={styles.row}>
          <h2 id="plan-title">지금 요금제</h2>
          <span className={styles.badge}>{plan.name}</span>
        </div>
        <p className={styles.row}>
          <span>{trial ? '체험' : '다음 결제'}</span>
          <b>
            {trial
              ? `${trialDaysLeft(subscription)}일 남음`
              : subscription.cancelOn
                ? `${monthDayKo(subscription.cancelOn)}에 끝나요`
                : `${monthDayKo(nextOn!)} · ${plan.price.toLocaleString('ko-KR')}원`}
          </b>
        </p>
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
        <h2 id="method-title">결제 수단</h2>
        <p className={styles.value}>
          {subscription.method
            ? METHOD_LABEL[subscription.method]
            : '아직 없어요 · 체험은 카드 없이 써요'}
        </p>
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
