import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useCalculation } from '../../../shared/api/calculationContext'

import { calculationReason } from '../../../shared/lib/calculationReason'
import { ReasonDetail } from '../../../shared/ui/ReasonDetail/ReasonDetail'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { EmptyValue } from '../../../shared/ui/EmptyValue/EmptyValue'
import { useCountUp } from '../../../shared/hooks/useCountUp'
import { Button } from '../../../shared/ui/Button/Button'
import { SoldOutStamp } from '../../../shared/ui/SoldOut/SoldOut'
import { Tape } from '../../../shared/ui/Tape/Tape'
import { getDashboard } from '../model/dashboardApi'
import styles from './DashboardPage.module.css'

// C2 계산 상태 띠. 입고 조건 저장·수불부 업로드 뒤 `/dashboard?run=번호`로 오면
// 공통 추적기가 한 번만 조회한다. 기존 대시보드 상태 띠는 유지하며 다른 화면과 결과를 공유한다.
function CalculationStatus({
  onClose,
  runId,
}: {
  onClose: () => void
  runId: number
}) {
  const navigate = useNavigate()
  const { run, phase, message, retry, trackRun } = useCalculation()
  useEffect(() => {
    trackRun(runId)
  }, [runId, trackRun])
  const state =
    phase === 'unknown'
      ? 'unknown'
      : phase === 'done'
        ? 'done'
        : phase === 'failed'
          ? 'failed'
          : 'running'
  const summary = run?.summary
  return (
    <aside
      aria-live="polite"
      className={styles.banner}
      data-state={`run-${state}`}
      role="status"
    >
      <span aria-hidden="true" className={styles.bannerMark}>
        {state === 'done' ? '✓' : state === 'running' ? '' : '!'}
      </span>
      <div>
        <strong>
          {state === 'running'
            ? phase === 'updating'
              ? '새 계산 결과를 불러오고 있어요'
              : run?.status === 'QUEUED'
                ? '계산을 기다리고 있어요'
                : '새로 계산하고 있어요'
            : state === 'done'
              ? '계산이 끝났어요'
              : state === 'failed'
                ? '계산하지 못했어요'
                : '계산 상태를 확인하지 못했어요'}
        </strong>
        <span>
          {state === 'running'
            ? '끝나면 이 화면이 저절로 바뀌어요. 다른 일을 해도 괜찮아요.'
            : state === 'done'
              ? summary && summary.notNeededCount != null
                ? `입고가 필요한 상품 ${summary.needCount}개 · 지금은 괜찮은 상품 ${summary.notNeededCount}개`
                : summary?.needCount != null
                  ? `입고가 필요한 상품 ${summary.needCount}개`
                  : '아래 표를 새 결과로 바꿨어요.'
              : state === 'failed'
                ? `${run?.errorMessage ?? '잠시 뒤 다시 시도해 주세요'} · 아래는 이전 결과예요.`
                : `${message ?? '계산 상태를 확인하지 못했어요.'} 아래는 마지막으로 받은 결과예요.`}
        </span>
      </div>
      {state === 'failed' ? (
        <Button onClick={() => navigate('/settings')}>
          입고 조건에서 다시 계산
        </Button>
      ) : state === 'unknown' ? (
        <Button onClick={retry} variant="secondary">
          상태 다시 확인
        </Button>
      ) : (
        state !== 'running' && (
          <Button onClick={onClose} variant="text">
            닫기
          </Button>
        )
      )}
    </aside>
  )
}

export type DashboardData = {
  baseDate: string
  /** 서버가 판정에 쓴 오늘 날짜(API 명세 3.5 today). 없으면 브라우저의 오늘 */
  today?: string
  freshness: 'fresh' | 'stale-result' | 'refresh-required' | 'no-result'
  lastCalculatedAt?: string
  /** 수불부를 한 번이라도 올렸는지. 계산 전 안내에서 어느 화면으로 보낼지 정한다 */
  hasUpload?: boolean
  /** 마지막으로 올린 수불부의 업로드 번호와 처리 상태. 실패·처리 중이면 입고 조건이 아니라 업로드로 안내한다 */
  latestUploadId?: number | null
  uploadStatus?: 'PROCESSING' | 'DONE' | 'FAILED'
  summary: {
    needed: number
    safe: number
    unavailable: number
    excluded: number
  }
  neededItems: Array<{
    id: string
    name: string
    barcode: string
    stockoutDate: string
    leadTime: number | null
    quantity: number
    cost: number
    risk: number | null
  }>
  unavailableItems: Array<{ name: string; reason: string }>
  excludedItems: Array<{ name: string; reason: string; date?: string }>
}

// 숫자 카드. "지금 넣어야 해요"는 투톤 대신 흰 상자에 테이프를 붙여 급한 상자로 표시한다.
function SummaryCard({
  empty,
  label,
  note,
  state,
  value,
}: {
  empty: boolean
  label: string
  note: ReactNode
  state: string
  value: number
}) {
  const shown = useCountUp(value)

  return (
    <article data-state={state}>
      {state === 'needed' && !empty && <Tape className={styles.tape} />}
      <span>{label}</span>
      <strong>
        {empty ? '—' : shown}
        <small>{empty ? '' : '개'}</small>
      </strong>
      {!empty && <em>{note}</em>}
    </article>
  )
}

type SortKey = 'stockout' | 'risk' | 'cost'

// "2026. 9. 5" 같은 날짜를 자릿수 맞춘 "20260905"로 바꿔 글자 비교로도 날짜 순이 되게 한다.
function dateKey(date: string) {
  return date
    .split('.')
    .map((part) => part.trim().padStart(2, '0'))
    .join('')
}

// "2026. 10. 29"·"2026-10-29" 어느 모양이든 하루 단위 숫자로. 두 날짜의 차이(일)를 셀 때 쓴다.
function dayNumber(date: string) {
  const [, y, m, d] = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(date) ?? []
  return y ? Date.UTC(Number(y), Number(m) - 1, Number(d)) / 864e5 : NaN
}

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}. ${now.getMonth() + 1}. ${now.getDate()}`
}

// 소진일이 지난 줄은 이름 옆에 "품절" 도장을 찍는다. 줄마다 기울기를 조금씩 다르게.

// 날짜 옆에는 며칠 지났는지만 짧게
function LateText({ days }: { days: number }) {
  if (!(days >= 0)) return null
  return (
    <small className={styles.late}>
      {days === 0 ? '오늘 소진' : `${days}일 지남`}
    </small>
  )
}

// 브라우저 기본 드롭다운 대신 한눈에 보이는 버튼형 정렬
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'stockout', label: '소진일 빠른 순' },
  { value: 'risk', label: '품절 위험 높은 순' },
  { value: 'cost', label: '금액 큰 순' },
]

export function DashboardPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const calculation = useCalculation()
  const routeRun = Number(params.get('run'))
  const routeRunId =
    Number.isSafeInteger(routeRun) && routeRun > 0 ? routeRun : null
  const runId = calculation.runId ?? routeRunId
  const [sort, setSort] = useState<SortKey>('stockout')
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
  })

  const items = useMemo(() => {
    const source = [...(query.data?.neededItems ?? [])]
    return source.sort((a, b) => {
      if (sort === 'cost') return b.cost - a.cost
      // 위험을 모르는 상품은 맨 뒤로
      if (sort === 'risk') return (b.risk ?? -1) - (a.risk ?? -1)
      return dateKey(a.stockoutDate).localeCompare(dateKey(b.stockoutDate))
    })
  }, [query.data?.neededItems, sort])

  if (query.isPending)
    return (
      <AsyncState
        description="최근 입고 계산 결과를 모으고 있어요."
        status="loading"
        title="대시보드를 불러오고 있어요"
      />
    )
  if (query.isError)
    return (
      <AsyncState
        description={query.error.message}
        onRetry={() => void query.refetch()}
        status="error"
        title="대시보드를 불러오지 못했어요"
      />
    )

  const data = query.data
  const refreshRequired = data.freshness === 'refresh-required'
  const noResult = data.freshness === 'no-result'
  // 예상 소진일이 오늘보다 며칠 지났는지(0 = 오늘 소진, 음수 = 아직). 기준일~오늘을 예측으로 이어 계산해서 지난 날짜가 나올 수 있다.
  const today = dayNumber(data.today ?? localToday())
  const daysPast = (date: string) => today - dayNumber(date)
  const beforeArrivalCount = data.neededItems.filter(
    (item) =>
      item.leadTime != null &&
      dayNumber(item.stockoutDate) < today + item.leadTime,
  ).length
  const passedCount = data.neededItems.filter(
    (item) => daysPast(item.stockoutDate) > 0,
  ).length

  return (
    <div className={styles.page}>
      {runId !== null && (
        <CalculationStatus
          key={runId}
          onClose={() => {
            calculation.dismiss()
            setParams(
              (previous) => {
                const next = new URLSearchParams(previous)
                next.delete('run')
                return next
              },
              { replace: true },
            )
          }}
          runId={runId}
        />
      )}
      {(refreshRequired || data.freshness === 'stale-result') && (
        <aside className={styles.banner} data-state={data.freshness}>
          <span aria-hidden="true" className={styles.bannerMark}>
            !
          </span>
          <div>
            <strong>
              {refreshRequired ? '새 수불부가 필요해요' : '갱신 전 결과예요'}
            </strong>
            <span>
              {refreshRequired
                ? '마지막 자료가 오늘보다 7일 넘게 오래되어 계산하지 않았어요.'
                : `마지막 계산이 실패해 ${data.lastCalculatedAt} 계산 결과를 보여주고 있어요.`}
            </span>
          </div>
          <Button
            onClick={() => navigate(refreshRequired ? '/upload' : '/settings')}
          >
            {refreshRequired ? '수불부 업로드' : '입고 조건에서 다시 계산'}
          </Button>
        </aside>
      )}

      <header className={styles.intro}>
        <div>
          <h1>
            {noResult
              ? '아직 계산한 결과가 없어요'
              : refreshRequired
                ? '수불부를 올리면 다시 계산해요'
                : `지금 넣어야 할 상품이 ${data.summary.needed}개 있어요`}
          </h1>
          <div className={styles.meta}>
            <span>{noResult ? '기준일 없음' : `기준일 ${data.baseDate}`}</span>
            {!noResult && (
              <b data-state={data.freshness}>
                {refreshRequired
                  ? '재업로드 필요'
                  : data.freshness === 'stale-result'
                    ? '갱신 전'
                    : '오늘까지 예상 출고 반영'}
              </b>
            )}
          </div>
        </div>
        {/* 계산 전·재업로드 필요엔 아래 안내 카드가 버튼을 하나만 갖는다(버튼 두 번 → 한 번) */}
        {!(noResult || refreshRequired) && (
          <Button onClick={() => navigate('/upload')}>수불부 업로드</Button>
        )}
      </header>

      {/* 보여 줄 숫자가 없을 땐 "—" 카드 네 장 대신 안내 카드 하나만(11/2 결정) */}
      {!(noResult || refreshRequired) && (
        <section className={styles.summary} aria-label="입고 예측 요약">
          {(
            [
              [
                '지금 넣어야 해요',
                data.summary.needed,
                'needed',
                passedCount > 0 ? (
                  <span className={styles.soldNote}>
                    <i aria-hidden="true" className={styles.soldDot} />
                    <span>
                      <b>{passedCount}개</b>는 이미 소진됐을 수 있어요
                    </span>
                  </span>
                ) : beforeArrivalCount > 0 ? (
                  `오늘 주문해도 ${beforeArrivalCount}개 상품은 배송 전 품절이 예상돼요`
                ) : (
                  '배송 기간과 예상 소진일을 확인해 주세요'
                ),
              ],
              [
                '아직 괜찮아요',
                data.summary.safe,
                'safe',
                '지금 발주가 급한 상품은 아니에요',
              ],
              [
                '계산 불가',
                data.summary.unavailable,
                'unavailable',
                '판매 기록이 부족해요',
              ],
              [
                '검산 제외',
                data.summary.excluded,
                'excluded',
                '재고 숫자가 맞지 않아요',
              ],
            ] as const
          ).map(([label, value, state, note]) => (
            <SummaryCard
              empty={refreshRequired || noResult}
              key={label}
              label={label}
              note={note}
              state={state}
              value={value}
            />
          ))}
        </section>
      )}

      {noResult ? (
        <AsyncState
          description={
            data.uploadStatus === 'FAILED'
              ? '마지막으로 올린 수불부를 처리하지 못했어요. 파일을 확인하고 다시 올려 주세요.'
              : data.uploadStatus === 'PROCESSING'
                ? '올린 수불부를 확인하고 있어요. 끝나면 입고 조건을 확인할 수 있어요.'
                : data.hasUpload
                  ? '입고 조건을 확인하고 계산하면 권장 입고량이 나와요.'
                  : '수불부를 올리고 입고 조건을 확인하면 권장 입고량이 나와요.'
          }
          onRetry={() =>
            navigate(
              data.uploadStatus === 'PROCESSING'
                ? `/upload/${data.latestUploadId}/result`
                : data.hasUpload
                  ? '/settings'
                  : '/upload',
            )
          }
          retryLabel={
            data.uploadStatus === 'FAILED'
              ? '수불부 다시 올리기'
              : data.uploadStatus === 'PROCESSING'
                ? '확인 중인 업로드 보기'
                : data.hasUpload
                  ? '입고 조건 확인하기'
                  : '수불부 업로드'
          }
          primaryAction
          status="empty"
          title="아직 계산 전이에요"
        >
          <ol aria-label="계산까지 순서" className={styles.steps}>
            {['수불부 올리기', '입고 조건 확인', '결과 보기'].map(
              (label, index) => {
                const current = data.hasUpload ? 1 : 0
                const state =
                  index < current ? 'done' : index === current ? 'now' : 'next'
                return (
                  <li
                    aria-current={state === 'now' ? 'step' : undefined}
                    data-state={state}
                    key={label}
                  >
                    <b aria-hidden="true">
                      {state === 'done' ? '✓' : index + 1}
                    </b>
                    {label}
                  </li>
                )
              },
            )}
          </ol>
        </AsyncState>
      ) : refreshRequired ? (
        <AsyncState
          description="오래된 자료로 계산한 숫자를 보여주지 않아요. 풀필먼트에서 최근 수불부를 받아 올려 주세요."
          status="empty"
          title="입고 필요 목록이 비어 있어요"
        />
      ) : (
        <>
          {items.length === 0 ? (
            <AsyncState
              description={
                data.summary.safe > 0
                  ? `기준일 ${data.baseDate} · ${data.summary.safe.toLocaleString()}개 상품 모두 다음 발주 주기까지 버텨요.`
                  : `기준일 ${data.baseDate} · 입고가 필요한 상품이 없어요.`
              }
              onRetry={() => navigate('/upload')}
              retryLabel="새 수불부 올리기"
              status="empty"
              title="지금 넣을 상품은 없어요"
            />
          ) : (
            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>입고가 필요한 상품</h2>
                  <p>오늘 기준 리드타임 안에 재고가 떨어질 상품이에요.</p>
                </div>
                <div
                  aria-label="입고 필요 목록 정렬"
                  className={styles.sort}
                  role="radiogroup"
                >
                  {SORT_OPTIONS.map((option) => (
                    <button
                      aria-checked={sort === option.value}
                      key={option.value}
                      onClick={() => setSort(option.value)}
                      role="radio"
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <p>표를 좌우로 움직이면 권장 입고량과 사입비를 볼 수 있어요.</p>
              <div
                className={styles.tableWrap}
                tabIndex={0}
                role="region"
                aria-label="입고 필요 상품 표, 좌우 스크롤 가능"
              >
                <table>
                  <thead>
                    <tr>
                      <th>상품</th>
                      <th>예상 소진일</th>
                      <th className={styles.num}>리드타임</th>
                      <th className={styles.num}>품절 위험</th>
                      <th className={styles.num}>권장 입고량</th>
                      <th className={styles.num}>사입비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      // 줄 전체를 눌러 상세로 간다. 키보드·화면 읽기용으로 상품명은 링크로 둔다.
                      <tr
                        className={styles.rowLink}
                        data-passed={
                          daysPast(item.stockoutDate) > 0 || undefined
                        }
                        key={item.id}
                        onClick={() => navigate(`/sku/${item.id}`)}
                      >
                        <td>
                          <div className={styles.nameLine}>
                            <Link to={`/sku/${item.id}`}>{item.name}</Link>
                            {daysPast(item.stockoutDate) > 0 && (
                              <SoldOutStamp />
                            )}
                          </div>
                          <span>{item.barcode}</span>
                        </td>
                        <td>
                          {item.stockoutDate === '—' ? (
                            <EmptyValue kind="short" />
                          ) : (
                            item.stockoutDate
                          )}
                          <LateText days={daysPast(item.stockoutDate)} />
                        </td>
                        <td className={styles.num}>
                          {item.leadTime == null ? (
                            <EmptyValue kind="unset" />
                          ) : (
                            `${item.leadTime}일`
                          )}
                        </td>
                        <td className={styles.num}>
                          {item.risk == null ? (
                            <EmptyValue kind="short" />
                          ) : (
                            `${item.risk}%`
                          )}
                        </td>
                        <td className={styles.num}>
                          <span className={styles.qty}>{item.quantity}개</span>
                        </td>
                        <td className={styles.num}>
                          {item.cost.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {/* 한 줄씩뿐이라 한 카드에 두 칸. 제목 앞 점 색은 위 숫자 카드와 짝 */}
          <section className={`${styles.card} ${styles.lowerGrid}`}>
            <div>
              <h2>
                <i aria-hidden="true" className={styles.dot} data-tone="warn" />
                계산 불가
              </h2>
              {data.unavailableItems.length === 0 && (
                <p className={styles.none}>계산 못 한 상품은 없어요.</p>
              )}
              {data.unavailableItems.map((item) => (
                <article className={styles.reason} key={item.name}>
                  <strong>{item.name}</strong>
                  <span>{calculationReason(item.reason)}</span>
                  <ReasonDetail reason={item.reason} />
                </article>
              ))}
            </div>
            <div>
              <h2>
                <i
                  aria-hidden="true"
                  className={styles.dot}
                  data-tone="danger"
                />
                검산 제외
              </h2>
              {data.excludedItems.length === 0 && (
                <p className={styles.none}>검산에서 뺀 상품은 없어요.</p>
              )}
              <p>
                이전 달 자료의 검산 오류도 포함돼요. 아래 날짜가 속한 수불부를
                고쳐 다시 올려 주세요.
              </p>
              {data.excludedItems.map((item) => (
                <article className={styles.reason} key={item.name}>
                  <strong>{item.name}</strong>
                  {'date' in item && typeof item.date === 'string' && (
                    <small>오류 자료 날짜 {String(item.date)}</small>
                  )}
                  <span>{calculationReason(item.reason)}</span>
                  <ReasonDetail reason={item.reason} />
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
