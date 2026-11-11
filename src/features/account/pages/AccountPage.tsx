import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useAuth } from '../../../auth/model/useAuth'
import { apiRequest } from '../../../shared/api/client'
import type { ReplenishmentNeeds } from '../../dashboard/model/dashboardApi'
import { getUploadPeriods } from '../../upload/model/uploadApi'
import { env } from '../../../shared/config/env'
import {
  calcLock,
  changeMethod,
  isoDate,
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
import { CancelModal } from '../ui/CancelModal'
import { WithdrawModal } from '../ui/WithdrawModal'
import { Toast } from '../../../shared/ui/Toast/Toast'
import { getProductSettings } from '../../settings/model/inboundSettingsApi'
import styles from './AccountPage.module.css'

// 한도의 80%를 넘으면 막대를 노랗게
const NEAR = 0.8

// 내 계정(#187): 들어오는 이유 대부분이 "얼마나 썼나·언제 결제되나"라 그걸 맨 위에,
// 결제 수단 → 결제 내역 → 계정 → 맨 아래 작은 글씨로 해지(11/5 승인 시안).
export function AccountPage() {
  const { user, signOut } = useAuth()
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
  const [withdrawing, setWithdrawing] = useState(false)
  // 해지·해지 취소가 됐는지 바로 알 수 있게 아래에 잠깐 띄운다
  const [notice, setNotice] = useState<string | null>(null)
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

  const trialLeft = trial ? trialDaysLeft(subscription) : 0
  // 체험 끝나는 날 = 시작일 + 14일(렌더마다 달라지지 않게 시작일에서 센다)
  const trialEnd = isoDate(
    new Date(Date.parse(subscription.startedOn) + TRIAL_DAYS * 864e5),
  )

  return (
    <div className={styles.page}>
      <h1>내 계정</h1>

      {/* 11/10 배치 A: 왼쪽 = 누구인지, 오른쪽 = 요금제 → 내 자료 → 결제 */}
      <div className={styles.layout}>
        <aside aria-labelledby="me-title" className={styles.profile}>
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
        </aside>

        <div className={styles.main}>
          <section aria-labelledby="plan-title" className={styles.block}>
            <div className={styles.hero}>
              <div>
                <h2 className={styles.label} id="plan-title">
                  지금 요금제
                </h2>
                <p className={styles.planLine}>
                  <strong>{plan.name}</strong>
                  {trial ? (
                    <span className={styles.pill}>
                      {trialLeft}일 남음 · {monthDayKo(trialEnd)}까지
                    </span>
                  ) : (
                    !failed &&
                    nextOn && (
                      <span className={styles.pill}>
                        {subscription.cancelOn
                          ? `${monthDayKo(subscription.cancelOn)}에 끝나요`
                          : `다음 결제 ${monthDayKo(nextOn)} · ${plan.price.toLocaleString('ko-KR')}원`}
                      </span>
                    )
                  )}
                </p>
              </div>
              <Link
                className={trial ? styles.primaryLink : styles.linkButton}
                to="/plans"
              >
                {trial ? '셀러 요금제로 계속 쓰기' : '요금제 바꾸기'}
              </Link>
            </div>
            {status && (
              <p className={styles.status}>
                <i aria-hidden="true" />
                <b>{status.text}</b>
                <Link to={status.to}>{status.label}</Link>
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
          </section>

          <MyData />

          <div className={styles.pair}>
            <section aria-labelledby="method-title" className={styles.block}>
              <div className={styles.row}>
                <h2 className={styles.label} id="method-title">
                  결제 수단
                </h2>
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
                <p className={styles.value}>
                  아직 없어요 · 체험은 카드 없이 써요
                </p>
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
                  <p className={styles.note}>
                    다음 결제부터 이 수단으로 결제돼요.
                  </p>
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
              <h2 className={styles.label} id="history-title">
                결제 내역
              </h2>
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
          </div>

          {/* 구독·계정 관리(11/11): 해지와 탈퇴를 맨 아래 한 상자에 줄마다 설명 + 같은 폭 버튼으로.
              흩어진 글자 링크 두 개 대신(레퍼런스: Craft "Danger zone", Notion 계정 설정) */}
          <section
            aria-labelledby="manage-title"
            className={`${styles.block} ${styles.manage}`}
          >
            <h2 className={styles.label} id="manage-title">
              구독·계정 관리
            </h2>
            {!trial && (
              <div className={styles.manageRow}>
                <div>
                  <b>
                    {subscription.cancelOn ? '구독 해지 예약됨' : '구독 해지'}
                  </b>
                  <span>
                    {subscription.cancelOn
                      ? `${monthDayKo(subscription.cancelOn)}까지 쓰고 끝나요. 취소하면 지금처럼 계속 써요`
                      : '다음 결제부터 멈춰요. 남은 기간은 그대로 써요'}
                  </span>
                </div>
                {subscription.cancelOn ? (
                  <button
                    className={styles.manageButton}
                    onClick={() => {
                      setSubscription(setCancel(subscription, false))
                      setNotice('해지를 취소했어요. 지금처럼 계속 써요')
                    }}
                    type="button"
                  >
                    해지 취소
                  </button>
                ) : (
                  <button
                    aria-label="구독 해지"
                    className={styles.manageButton}
                    onClick={() => setConfirmCancel(true)}
                    type="button"
                  >
                    해지하기
                  </button>
                )}
              </div>
            )}
            <div className={styles.manageRow}>
              <div>
                <b>회원 탈퇴</b>
                <span>계정과 올린 수불부·계산 결과를 모두 지워요</span>
              </div>
              <button
                aria-label="회원 탈퇴"
                className={styles.manageButton}
                data-danger=""
                onClick={() => setWithdrawing(true)}
                type="button"
              >
                탈퇴하기
              </button>
            </div>
          </section>
        </div>
      </div>
      {withdrawing && (
        <WithdrawModal
          onClose={() => setWithdrawing(false)}
          planName={plan.name}
          subscribed={!trial && !subscription.cancelOn}
          usableUntil={nextOn ? monthDayKo(nextOn) : null}
        />
      )}
      {/* 해지는 팝업 두 단계(#237): 놓치는 것 → 진짜 확인 */}
      {confirmCancel && nextOn && (
        <CancelModal
          nextOn={nextOn}
          onCancel={() => {
            setSubscription(setCancel(subscription, true))
            setConfirmCancel(false)
            setNotice(
              `해지됐어요. ${monthDayKo(nextOn)}까지는 지금처럼 쓸 수 있어요`,
            )
          }}
          onClose={() => setConfirmCancel(false)}
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
