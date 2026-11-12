import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../../shared/ui/Modal/Modal'
import { Button } from '../../../shared/ui/Button/Button'

import { useAuth } from '../../../auth/model/useAuth'
import { apiRequest } from '../../../shared/api/client'
import type { ReplenishmentNeeds } from '../../dashboard/model/dashboardApi'
import { getUploadPeriods } from '../../upload/model/uploadApi'
import { useActionLock } from '../../../shared/hooks/useActionLock'
import {
  calcLock,
  dayOf,
  isoDate,
  monthDayKo,
  paymentProblem,
  planOf,
  type Subscription,
  TRIAL_DAYS,
  trialDaysLeft,
} from '../../billing/model/billing'
import {
  billingErrorText,
  type Invoice,
  useBillingMutation,
  useInvoices,
  usePaymentMethods,
  usePlans,
  useSubscription,
} from '../../billing/model/billingApi'
import { useCardRegistration } from '../../billing/model/payment'
import { PendingPayments } from '../../billing/pages/PendingPayments'
import { CancelModal } from '../ui/CancelModal'
import { WithdrawModal } from '../ui/WithdrawModal'
import { Toast } from '../../../shared/ui/Toast/Toast'
import { getProductSettings } from '../../settings/model/inboundSettingsApi'
import { NotificationSettings } from '../../notifications/NotificationSettings'
import styles from './AccountPage.module.css'

// 결제 내역 한 줄의 상태를 쉬운 말로
function invoiceState(invoice: Invoice) {
  if (invoice.refundStatus === 'CANCELED') return '취소·환불 완료'
  if (
    invoice.refundStatus === 'PROCESSING' ||
    invoice.refundStatus === 'UNKNOWN'
  )
    return '취소 확인 중'
  if (invoice.refundStatus === 'REVIEW_REQUIRED') return '취소 확인 필요'
  if (invoice.status === 'VOID' || invoice.paymentStatus === 'VOID')
    return '취소됨'
  if (invoice.paymentStatus === 'SUCCEEDED' || invoice.status === 'PAID')
    return '결제됨'
  if (invoice.paymentStatus === 'DECLINED') return '결제 안 됨'
  if (invoice.paymentStatus === 'WAITING_FOR_DEPOSIT') return '입금 대기'
  if (
    invoice.paymentStatus === 'UNKNOWN' ||
    invoice.paymentStatus === 'REVIEW_REQUIRED'
  )
    return '확인 중'
  return '결제 중'
}

// 결제가 꺼져 있거나 못 받아 왔을 때 쓰는 빈 구독(체험처럼 보되 요금제 칸은 안내문으로 바꾼다)
const OFF: Subscription = {
  planId: 'trial',
  status: 'UNKNOWN',
  trialEnd: null,
  periodStart: null,
  periodEnd: null,
  nextChargeAt: null,
  cancelAtPeriodEnd: false,
  graceUntil: null,
  amount: null,
  priceVersion: null,
  entitlements: {
    canCalculate: true,
    canUpload: true,
    canGenerateInsight: true,
    productLimit: null,
    monthlyInsightLimit: null,
    reason: null,
  },
}

// 한도의 80%를 넘으면 막대를 노랗게
const NEAR = 0.8

// 내 계정(#187): 들어오는 이유 대부분이 "얼마나 썼나·언제 결제되나"라 그걸 맨 위에,
// 결제 수단 → 결제 내역 → 계정 → 맨 아래 작은 글씨로 해지(11/5 승인 시안).
export function AccountPage() {
  const { user, signOut } = useAuth()
  const billingCache = useQueryClient()
  const subQuery = useSubscription()
  const billingOff = !subQuery.data
  const subscription = subQuery.data ?? OFF
  const methods = usePaymentMethods().data
  const invoices = useInvoices().data?.items
  const current = methods?.find((item) => item.current)
  const plans = usePlans().data
  const normal = plans?.some((p) => p.interval === 'ONE_TIME') ?? false
  const recurring = plans?.some((p) => p.interval === 'MONTH') ?? false
  const consentVersion = plans?.[0]?.consentVersion
  const startCard = useCardRegistration({
    email: user?.email,
    name: user?.name,
  })
  const cancel = useBillingMutation('/subscription/cancel')
  const resume = useBillingMutation('/subscription/resume', () => ({
    consentVersion,
  }))
  const retry = useBillingMutation('/invoices')
  const [refundTarget, setRefundTarget] = useState<Invoice | null>(null)
  const [refundReason, setRefundReason] = useState('테스트 결제 취소')
  const refundTitle = useId()
  const refund = useBillingMutation<{ status: string }>('/invoices', () => ({
    reason: refundReason,
  }))
  const newestPaid = invoices?.find(
    (item) => item.status === 'PAID' && item.paymentStatus === 'SUCCEEDED',
  )
  async function cancelPayment() {
    if (!refundTarget) return
    await attempt(async () => {
      const result = await refund
        .mutateAsync(`/invoices/${refundTarget.invoiceId}/cancel-payment`)
        .catch((error: unknown) => {
          void billingCache.invalidateQueries({ queryKey: ['billing'] })
          throw error
        })
      setNotice(
        result.status === 'CANCELED'
          ? '결제 취소·환불이 확인됐어요'
          : '취소 결과를 확인하고 있어요. 결제 내역에서 확인해 주세요',
      )
      setRefundTarget(null)
    })
  }
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  // 해지·해지 취소가 됐는지 바로 알 수 있게 아래에 잠깐 띄운다
  const [notice, setNotice] = useState<string | null>(null)
  // 결제 요청이 막히면(결제 꺼짐 등) 그 말을 알린다
  const [problem, setProblem] = useState<string | null>(null)
  async function attempt(action: () => Promise<unknown>, done?: string) {
    setProblem(null)
    try {
      await action()
      if (done) setNotice(done)
    } catch (error) {
      setProblem(billingErrorText(error))
    }
  }
  // 결제 수단 바꾸기: 카드 등록창으로 간다
  const { isPending: changing, run: changeCard } = useActionLock(() =>
    attempt(() => startCard('REPLACE_METHOD')),
  )
  const products = useQuery({
    queryKey: ['products', 'count'],
    queryFn: getProductSettings,
  })
  const plan = planOf(subscription.planId)
  const trial = subscription.planId === 'trial'
  // 지금 기간이 끝나는 날 = 다음 결제일(해지하면 이날 끝난다)
  const periodEnd = subscription.periodEnd
    ? dayOf(subscription.periodEnd)
    : null
  const cancelOn =
    subscription.status !== 'CANCELED' && subscription.cancelAtPeriodEnd
      ? periodEnd
      : null
  const nextOn = subscription.nextChargeAt
    ? dayOf(subscription.nextChargeAt)
    : null
  const used = products.data?.total
  const limit = subscription.entitlements.productLimit ?? plan.products
  const ratio = used != null && limit ? Math.min(used / limit, 1) : 0
  const trialLeft = trialDaysLeft(subscription)
  const daysUsed = trial ? TRIAL_DAYS - trialLeft : 0
  // 체험 끝·매달 결제 실패는 따로 띠를 두지 않고 요금제 칸의 "상태" 줄로(#214, Google Workspace 식)
  const lock = calcLock(subscription)
  const failed = paymentProblem(subscription)
  const declined = invoices?.find(
    (item) => item.paymentStatus === 'DECLINED' && item.status === 'OPEN',
  )
  const status =
    normal && lock
      ? { text: '이용 기간이 끝났어요', to: '/plans', label: '이용권 결제하기' }
      : !declined && lock?.reason === 'TRIAL_ENDED'
        ? { text: '체험 끝남', to: '/plans', label: '요금제 고르기' }
        : declined || failed
          ? {
              text: lock
                ? '결제 안 됨 · 새 계산 멈춤'
                : `결제 안 됨${failed?.until ? ` · ${monthDayKo(dayOf(failed.until))}까지` : ''}`,
              // 안 된 결제가 목록에 있으면 바로 다시 결제, 없으면 카드부터 바꾼다
              onClick: () =>
                void attempt(
                  () =>
                    declined
                      ? retry.mutateAsync(
                          `/invoices/${declined.invoiceId}/retry`,
                        )
                      : startCard('REPLACE_METHOD'),
                  declined
                    ? '다시 결제를 요청했어요. 결과는 결제 내역에서 확인해 주세요'
                    : undefined,
                ),
              label: declined ? '다시 결제' : '결제 수단 바꾸기',
            }
          : null

  const trialEnd = subscription.trialEnd ? dayOf(subscription.trialEnd) : null

  return (
    <div className={styles.page}>
      <h1>내 계정</h1>

      {/* 11/10 배치 A: 왼쪽 = 누구인지, 오른쪽 = 요금제 → 내 자료 → 결제 */}
      <div className={styles.layout}>
        <aside
          aria-labelledby="me-title"
          className={styles.profile}
          data-rise-self=""
        >
          <h2 className={styles.srOnly} id="me-title">
            계정
          </h2>
          <div className={styles.who}>
            <span aria-hidden="true" className={styles.avatar}>
              {(user?.name ?? '?').slice(0, 1)}
            </span>
            <span>
              <b>{user?.name}</b>
              <small>{user?.companyName}</small>
            </span>
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>이메일</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt>비밀번호</dt>
              <dd className={styles.muted}>바꾸기 준비 중</dd>
            </div>
          </dl>
          <button
            className={styles.signOut}
            onClick={() => void signOut()}
            type="button"
          >
            로그아웃
          </button>
          <div className={styles.danger}>
            <button
              className={styles.dangerLink}
              onClick={() => setWithdrawing(true)}
              type="button"
            >
              회원 탈퇴
            </button>
            <span>계정과 올린 자료를 모두 지워요</span>
          </div>
        </aside>

        <div className={styles.main} data-rise="">
          <NotificationSettings />
          <section aria-labelledby="plan-title" className={styles.block}>
            {billingOff ? (
              <>
                <h2 className={styles.label} id="plan-title">
                  지금 요금제
                </h2>
                <p className={styles.value}>
                  {subQuery.isError
                    ? '결제가 아직 켜지지 않았어요'
                    : '불러오는 중이에요'}
                </p>
              </>
            ) : (
              <>
                <div className={styles.hero}>
                  <div>
                    <h2 className={styles.label} id="plan-title">
                      지금 요금제
                    </h2>
                    <p className={styles.planLine}>
                      <strong>{plan.name}</strong>
                      {trial ? (
                        trialEnd && (
                          <span className={styles.pill}>
                            {trialLeft}일 남음 · {monthDayKo(trialEnd)}까지
                          </span>
                        )
                      ) : subscription.status === 'CANCELED' ? (
                        <span className={styles.pill}>이용 종료</span>
                      ) : (
                        !failed &&
                        (cancelOn || nextOn) && (
                          <span className={styles.pill}>
                            {cancelOn
                              ? `${monthDayKo(cancelOn)}에 끝나요`
                              : `다음 결제 ${monthDayKo(nextOn!)} · ${(subscription.amount ?? plan.price).toLocaleString('ko-KR')}원`}
                          </span>
                        )
                      )}
                    </p>
                  </div>
                  {/* 구독 해지는 요금제 상자 안에(11/11 레퍼런스: Whereby·Washington Post) */}
                  <div className={styles.planActions}>
                    {recurring && cancelOn && !trial ? (
                      <button
                        className={styles.primaryLink}
                        onClick={() => {
                          void attempt(
                            () => resume.mutateAsync(undefined),
                            '해지를 취소했어요. 지금처럼 계속 써요',
                          )
                        }}
                        type="button"
                      >
                        해지 취소
                      </button>
                    ) : (
                      <Link
                        className={
                          trial ? styles.primaryLink : styles.linkButton
                        }
                        to="/plans"
                      >
                        {trial ? '셀러 요금제로 계속 쓰기' : '요금제 바꾸기'}
                      </Link>
                    )}
                    {!normal &&
                      !trial &&
                      subscription.status !== 'CANCELED' &&
                      (cancelOn ? (
                        <span
                          aria-hidden="true"
                          className={`${styles.textButton} ${styles.slot}`}
                        >
                          구독 해지
                        </span>
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
                </div>
                {status && (
                  <p className={styles.status}>
                    <i aria-hidden="true" />
                    <b>{status.text}</b>
                    {!('onClick' in status) ? (
                      <Link to={status.to}>{status.label}</Link>
                    ) : (
                      <button
                        className={styles.textButton}
                        disabled={retry.isPending || changing}
                        onClick={status.onClick}
                        type="button"
                      >
                        {status.label}
                      </button>
                    )}
                  </p>
                )}
                <div className={styles.meters}>
                  {trial && (
                    <div>
                      <p className={styles.row}>
                        <span>체험</span>
                        <b>
                          {daysUsed} / {TRIAL_DAYS}일
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
                        <span
                          style={{ width: `${(daysUsed / TRIAL_DAYS) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div>
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
                  <div>
                    <p className={styles.row}>
                      <span>AI 인사이트</span>
                      <b>{plan.insights}</b>
                    </p>
                  </div>
                </div>
              </>
            )}
          </section>

          <MyData />

          {/* 결제(11/11): 반쪽 상자 두 개가 비어 보여서 아래 관리 상자처럼 한 상자에 줄로 */}
          {!billingOff && (
            <section
              aria-labelledby="pay-title"
              className={`${styles.block} ${styles.manage}`}
            >
              <h2 className={styles.label} id="pay-title">
                결제
              </h2>
              {normal && (
                <>
                  <p>
                    1개월 이용권 · 자동 청구 없음. 만료 후 직접 다시
                    결제해주세요.
                  </p>
                  <PendingPayments />
                </>
              )}
              {!normal && (
                <div className={styles.manageRow}>
                  <div>
                    <b>결제 수단</b>
                    {current ? (
                      <span>
                        신용·체크카드{' '}
                        <span className={styles.card}>
                          {current.maskedNumber}
                        </span>
                        <span className={styles.via}>토스페이먼츠</span>
                      </span>
                    ) : (
                      <span>아직 없어요 · 체험은 카드 없이 써요</span>
                    )}
                  </div>
                  {current && (
                    <button
                      className={styles.manageButton}
                      disabled={changing}
                      onClick={() => void changeCard()}
                      type="button"
                    >
                      카드 바꾸기
                    </button>
                  )}
                </div>
              )}
              <div className={`${styles.manageRow} ${styles.historyRow}`}>
                <b>결제 내역</b>
                {invoices?.length ? (
                  <table className={styles.history}>
                    <tbody>
                      {invoices.map((item) => (
                        <tr key={item.invoiceId}>
                          <td>
                            {monthDayKo(dayOf(item.paidAt ?? item.periodStart))}
                          </td>
                          <td>
                            {planOf(item.planId).name} · {invoiceState(item)}
                          </td>
                          <td>{item.amount.toLocaleString('ko-KR')}원</td>
                          <td>
                            {item.canceledAt && (
                              <span>
                                취소일 {monthDayKo(dayOf(item.canceledAt))}
                              </span>
                            )}
                            {item.invoiceId === newestPaid?.invoiceId &&
                              !item.refundStatus && (
                                <button
                                  className={styles.textButton}
                                  type="button"
                                  onClick={() => {
                                    setProblem(null)
                                    setRefundReason('테스트 결제 취소')
                                    setRefundTarget(item)
                                  }}
                                >
                                  결제 취소·환불
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <span>아직 결제한 적 없어요</span>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
      {refundTarget && (
        <Modal
          labelledBy={refundTitle}
          onClose={() => {
            if (!refund.isPending) setRefundTarget(null)
          }}
        >
          <h2 id={refundTitle}>결제를 전액 취소할까요?</h2>
          <p>
            {refundTarget.amount.toLocaleString('ko-KR')}원 전액을 취소합니다.
            {normal
              ? '취소가 확인되면 유료 이용이 종료됩니다.'
              : '취소가 확인되면 유료 이용이 종료되고 다음 자동 청구도 중지됩니다.'}
          </p>
          <p>토스 테스트 결제이며 실제 돈은 청구·환불되지 않습니다.</p>
          <label className={styles.refundReason}>
            취소 사유
            <input
              maxLength={200}
              value={refundReason}
              disabled={refund.isPending}
              onChange={(event) => setRefundReason(event.target.value)}
            />
          </label>
          {problem && <p role="alert">{problem}</p>}
          <div className={styles.refundActions}>
            <Button
              disabled={refund.isPending || !refundReason.trim()}
              onClick={() => void cancelPayment()}
            >
              전액 취소 요청
            </Button>
            <Button
              variant="secondary"
              disabled={refund.isPending}
              onClick={() => setRefundTarget(null)}
            >
              돌아가기
            </Button>
          </div>
        </Modal>
      )}
      {withdrawing && (
        <WithdrawModal
          onClose={() => setWithdrawing(false)}
          planName={plan.name}
          subscribed={!trial && subscription.status !== 'CANCELED' && !cancelOn}
          usableUntil={periodEnd ? monthDayKo(periodEnd) : null}
        />
      )}
      {/* 해지는 팝업 두 단계(#237): 놓치는 것 → 진짜 확인 */}
      {confirmCancel && periodEnd && (
        <CancelModal
          nextOn={periodEnd}
          onCancel={() => {
            setConfirmCancel(false)
            void attempt(
              () => cancel.mutateAsync(undefined),
              `해지됐어요. ${monthDayKo(periodEnd)}까지는 지금처럼 쓸 수 있어요`,
            )
          }}
          onClose={() => setConfirmCancel(false)}
        />
      )}
      {problem && !refundTarget && (
        <Toast
          duration={6000}
          message={problem}
          onClose={() => setProblem(null)}
        />
      )}
      {notice && (
        <Toast
          duration={4000}
          message={notice}
          onClose={() => setNotice(null)}
        />
      )}
    </div>
  )
}

// 올린 첫 달 ~ 마지막 달 사이에 빠진 달 수
function monthGap(months: string[]) {
  const toIndex = (key: string) => {
    const [y, m] = key.split('-').map(Number)
    return y * 12 + m - 1
  }
  const span = toIndex(months.at(-1)!) - toIndex(months[0]) + 1
  return span - new Set(months).size
}

// 마지막 기록에서 이만큼 지나면 "재업로드 필요"(dashboardApi REUPLOAD_AFTER_DAYS와 같은 7일)
const FRESH_DAYS = 7

// 2026-11-09 → 11/9
function slash(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}`
}

// 내 자료: 언제 것까지 올렸고 언제까지 계산되는지, 빈 달이 몇 개인지(11/10 — 7일 규칙을 대시보드에서만 늦게 알던 것).
// 올린 달 16칸 막대는 "채워야 하는 숙제"처럼 보여 빼고 숫자만 둔다.
function MyData() {
  const needs = useQuery({
    queryKey: ['dashboard', 'account'],
    queryFn: () =>
      apiRequest<ReplenishmentNeeds>('/dashboard/replenishment-needs'),
  })
  const periods = useQuery({
    queryKey: ['upload-periods'],
    queryFn: getUploadPeriods,
  })
  const asOf = needs.data?.asOfDate ?? null
  const months = (periods.data?.items ?? []).map((item) => item.period).sort()
  const first = months[0]
  const last = months.at(-1)
  const until = asOf
    ? isoDate(new Date(Date.parse(asOf) + FRESH_DAYS * 864e5))
    : null
  const daysLeft =
    until && needs.data
      ? Math.round((Date.parse(until) - Date.parse(needs.data.today)) / 864e5)
      : null
  const missing = months.length > 0 ? monthGap(months) : 0

  return (
    <section aria-labelledby="data-title" className={styles.block}>
      <div className={styles.row}>
        <h2 className={styles.label} id="data-title">
          내 자료
        </h2>
        <Link className={styles.textLink} to="/upload">
          수불부 올리기 →
        </Link>
      </div>
      <div className={styles.dataGrid}>
        <div>
          <span className={styles.k}>마지막 기록</span>
          <strong className={styles.v}>{asOf ? slash(asOf) : '—'}</strong>
          {until && daysLeft != null && (
            <small data-warn={daysLeft <= 2 || undefined}>
              {daysLeft >= 0
                ? `${slash(until)}까지 계산돼요 · ${daysLeft}일 남음`
                : `${slash(until)}에 계산이 멈췄어요 · 새 수불부가 필요해요`}
            </small>
          )}
        </div>
        <div>
          <span className={styles.k}>올린 기간</span>
          <strong className={styles.v}>
            {months.length ? `${months.length}개월` : '—'}
          </strong>
          {first && last && (
            <small>
              {first} ~ {last}
              {missing > 0 && ` · 빈 달 ${missing}개`}
            </small>
          )}
        </div>
        <div>
          <span className={styles.k}>마지막 계산</span>
          <strong className={styles.v}>
            {needs.data?.resultComputedAt
              ? monthDayKo(needs.data.resultComputedAt.slice(0, 10))
              : '—'}
          </strong>
          {needs.data?.resultComputedAt && (
            <small>지금 넣어야 할 상품 {needs.data.summary.needCount}개</small>
          )}
        </div>
      </div>
    </section>
  )
}
