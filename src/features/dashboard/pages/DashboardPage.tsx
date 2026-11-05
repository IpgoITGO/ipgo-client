import { useQuery } from '@tanstack/react-query'
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useCalculation } from '../../../shared/api/calculationContext'

import { calculationReason } from '../../../shared/lib/calculationReason'
import { ReasonDetail } from '../../../shared/ui/ReasonDetail/ReasonDetail'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { EmptyValue } from '../../../shared/ui/EmptyValue/EmptyValue'
import { useCountUp } from '../../../shared/hooks/useCountUp'
import { Button } from '../../../shared/ui/Button/Button'
import { LockedButton } from '../../billing/components/LockedButton'
import { useCalcLock } from '../../billing/model/useCalcLock'
import { SoldOutStamp } from '../../../shared/ui/SoldOut/SoldOut'
import { Tape } from '../../../shared/ui/Tape/Tape'
import {
  loadStorageSettings,
  storageCostTotal,
  STORAGE_LINK,
} from '../../settings/model/storageCost'
import {
  isOwnPlan,
  isStale,
  shortBasis,
  shortDate,
  usePlanned,
} from '../../sku/model/plannedQuantity'
import { getAllProducts } from '../../settings/model/plannedReceiptsApi'
import { getDashboard } from '../model/dashboardApi'
import { downloadCsv, orderFileName, toOrderCsv } from '../model/orderCsv'
import styles from './DashboardPage.module.css'

// 보관 비용(#185): 입고 필요 상품을 권장 수량대로 넣으면 한 달 보관비가 얼마인지 한 줄로.
// 크기를 안 넣은 상품은 0원으로 더하지 않고 개수만 따로 적는다.
function StorageTotal({
  items,
}: {
  items: Array<{ id: string; quantity: number | null }>
}) {
  const settings = loadStorageSettings()
  const { total, missing, counted } = storageCostTotal(items, settings)
  if (settings.ratePerCbm == null || counted === 0) {
    return (
      // 아직 안 넣었으면 문장 대신 누를 곳이 보이는 작은 칸 하나(11/5 사장님 — 줄글은 지저분하고 안 눌림)
      <Link className={styles.storageCta} to={STORAGE_LINK}>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
          <path d="M3 8l9 5 9-5M12 13v8" />
        </svg>
        한 달 보관비 보기
        <small>상자 크기·요율 넣기</small>
      </Link>
    )
  }
  return (
    <p className={styles.storageLine}>
      다 넣으면 한 달 보관비 <b>{total.toLocaleString()}원</b>
      {missing > 0 && (
        <span>
          {' '}
          · 크기 미입력 {missing}개 빠짐 <Link to={STORAGE_LINK}>넣기 →</Link>
        </span>
      )}
    </p>
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
  /** 아직 괜찮은 상품(서버 #103). 없으면 화면이 상품 목록으로 이름·바코드만 채운다 */
  safeItems?: Array<{
    id: string
    name: string
    barcode: string
    stockoutDate: string
    leadTime: number | null
  }>
  unavailableItems: Array<{ id?: string; name: string; reason: string }>
  excludedItems: Array<{
    id?: string
    name: string
    reason: string
    date?: string
  }>
}

// 숫자 상자 = 아래 목록을 고르는 탭. 고른 상자는 주소(?tab=)에 남는다.
const TABS = ['need', 'safe', 'na', 'ex'] as const
type Tab = (typeof TABS)[number]
// 여유(소진일 − 오늘 − 리드타임)가 이 날수 이하면 "곧 넣어야 해요"
const SOON_DAYS = 7

// 숫자 상자. 누르면 아래 판이 그 상자의 상품으로 바뀐다. 고른 상자에는 노란 테두리와
// 테이프가 날아와 붙는다(테이프는 고를 때 새로 그려져 붙는 연출이 매번 다시 돈다).
function SummaryCard({
  label,
  note,
  onSelect,
  selected,
  state,
  tab,
  value,
}: {
  label: string
  note: ReactNode
  onSelect: () => void
  selected: boolean
  state: string
  tab: Tab
  value: number
}) {
  const shown = useCountUp(value)

  return (
    <button
      aria-controls="dashboard-list"
      aria-selected={selected}
      className={styles.box}
      data-state={state}
      id={`dashboard-tab-${tab}`}
      onClick={onSelect}
      role="tab"
      tabIndex={selected ? 0 : -1}
      type="button"
    >
      {selected && <Tape className={styles.tape} />}
      <span className={styles.boxLabel}>{label}</span>
      <strong>
        {shown}
        <small>개</small>
      </strong>
      <em>{note}</em>
    </button>
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

const PANEL_TITLE: Record<Tab, string> = {
  need: '입고가 필요한 상품',
  safe: '아직 괜찮은 상품',
  na: '계산 불가',
  ex: '검산 제외',
}

const PANEL_DESCRIPTION: Record<Tab, string> = {
  need: '오늘 기준 리드타임 안에 재고가 떨어질 상품이에요.',
  safe: '다음 입고 전에 재고가 버텨요. 소진일이 가까운 순이에요.',
  na: '수불부는 정상이지만 아직 계산할 수 없는 상품이에요.',
  ex: '재고 숫자가 맞지 않아 계산에서 뺐어요. 그 날짜가 든 수불부를 고쳐 다시 올려 주세요. 이전 달 자료의 오류도 포함돼요.',
}

function NoMatch({ search }: { search: string }) {
  return <p className={styles.none}>"{search}"에 맞는 상품이 없어요.</p>
}

export function DashboardPage() {
  const planned = usePlanned()
  const navigate = useNavigate()
  const lock = useCalcLock()
  const [params, setParams] = useSearchParams()
  const calculation = useCalculation()
  const routeRun = Number(params.get('run'))
  const routeRunId =
    Number.isSafeInteger(routeRun) && routeRun > 0 ? routeRun : null
  // 업로드·입고 조건 저장 뒤 `/dashboard?run=번호`로 오면 공통 추적기(오른쪽 아래 작은 창)에 넘기고 주소는 정리한다
  const { trackRun } = calculation
  useEffect(() => {
    if (routeRunId === null) return
    trackRun(routeRunId)
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('run')
        return next
      },
      { replace: true },
    )
  }, [routeRunId, trackRun, setParams])
  const [sort, setSort] = useState<SortKey>('stockout')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const tabParam = params.get('tab')
  const tab: Tab = TABS.find((value) => value === tabParam) ?? 'need'
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
  })
  // 서버가 아직 괜찮은 상품 목록을 주기 전(#103)에는 상품 목록에서 나머지를 채운다
  const products = useQuery({
    queryKey: ['products', 'dashboard-safe'],
    queryFn: getAllProducts,
    enabled:
      tab === 'safe' && query.data !== undefined && !query.data.safeItems,
  })

  function selectTab(next: Tab) {
    setSearch('')
    setParams(
      (previous) => {
        const nextParams = new URLSearchParams(previous)
        if (next === 'need') nextParams.delete('tab')
        else nextParams.set('tab', next)
        return nextParams
      },
      { replace: true },
    )
  }

  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowLeft: TABS.length - 1 }[event.key]
    if (!step) return
    event.preventDefault()
    const next = TABS[(TABS.indexOf(tab) + step) % TABS.length]
    selectTab(next)
    document.getElementById(`dashboard-tab-${next}`)?.focus()
  }

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

  // 표 안 검색: 상품명(대소문자 무시)·바코드
  const keyword = search.trim().toLowerCase()
  const matches = (item: { name: string; barcode?: string }) =>
    !keyword ||
    item.name.toLowerCase().includes(keyword) ||
    (item.barcode ?? '').includes(keyword)
  // 아직 괜찮은 상품: 서버 목록(#103)이 없으면 상품 목록에서 다른 세 상자에 든 상품을 뺀다
  const listedIds = new Set(
    [...data.neededItems, ...data.unavailableItems, ...data.excludedItems].map(
      (item) => item.id,
    ),
  )
  const safeItems = (
    data.safeItems ??
    (products.data?.items ?? [])
      .filter((item) => item.isActive && !listedIds.has(String(item.productId)))
      .map((item) => ({
        id: String(item.productId),
        name: item.skuName,
        barcode: item.skuBarcode,
        stockoutDate: '—',
        leadTime: null,
      }))
  )
    .slice()
    .sort((a, b) =>
      dateKey(a.stockoutDate).localeCompare(dateKey(b.stockoutDate)),
    )
  // 주문 마감일(소진일 − 리드타임 = 오늘 + n일)
  const orderDeadline = (days: number) => {
    const d = new Date((today + days) * 864e5)
    const m = d.getUTCMonth() + 1
    return {
      short: `${m}/${d.getUTCDate()}`,
      long: `${m}월 ${d.getUTCDate()}일`,
    }
  }
  // 다음 입고가 도착한 뒤 며칠 더 버티는지(소진일 − 오늘 − 리드타임). 모르면 null
  const slack = (item: { stockoutDate: string; leadTime: number | null }) =>
    item.stockoutDate === '—' || item.leadTime == null
      ? null
      : dayNumber(item.stockoutDate) - today - item.leadTime
  const soonCount = safeItems.filter((item) => {
    const room = slack(item)
    return room !== null && room <= SOON_DAYS
  }).length
  const shownNeed = items.filter(matches)
  const shownSafe = safeItems.filter(matches)
  const reasonItems = tab === 'ex' ? data.excludedItems : data.unavailableItems
  const shownReasons = reasonItems.filter(matches)
  const tabCount: Record<Tab, number> = {
    need: data.summary.needed,
    safe: data.summary.safe,
    na: data.summary.unavailable,
    ex: data.summary.excluded,
  }

  // 발주 목록: 고른 상품의 수량·사입비 합계와 엑셀(CSV) 받기
  const pickedItems = items.filter((item) => picked.has(item.id))
  // 상세에서 정한 내 입고량이 있으면 합계·사입비는 그 수량으로(사입비 = 권장 기준 단가 × 수량)
  const planOf = (item: { id: string }) =>
    isOwnPlan(planned[item.id]) ? planned[item.id] : undefined
  const orderQtyOf = (item: { id: string; quantity: number }) =>
    planOf(item)?.quantity ?? item.quantity
  const orderCostOf = (item: { id: string; quantity: number; cost: number }) =>
    item.quantity > 0
      ? Math.round((item.cost / item.quantity) * orderQtyOf(item))
      : item.cost
  const struck = (item: { id: string }) => {
    const plan = planOf(item)
    return !!plan && !isStale(plan, data.baseDate)
  }
  const planCell = (item: { id: string }) => {
    const plan = planOf(item)
    if (!plan) return '—'
    return (
      <>
        <b>{plan.quantity.toLocaleString()}개</b>
        {isStale(plan, data.baseDate) ? (
          <span className={styles.staleTag}>
            ⟲ {shortBasis(plan.basis)} 계산 기준
          </span>
        ) : (
          <small className={styles.planSub}>
            {shortDate(plan.decidedAt)} 정함
          </small>
        )}
      </>
    )
  }
  const pickedQty = pickedItems.reduce((sum, item) => sum + orderQtyOf(item), 0)
  const pickedCost = pickedItems.reduce(
    (sum, item) => sum + orderCostOf(item),
    0,
  )
  function togglePick(id: string) {
    setPicked((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function pickAll(checked: boolean) {
    setPicked((previous) => {
      const next = new Set(previous)
      shownNeed.forEach((item) =>
        checked ? next.add(item.id) : next.delete(item.id),
      )
      return next
    })
  }
  function exportOrder() {
    downloadCsv(
      orderFileName(),
      toOrderCsv(
        pickedItems.map((item) => ({
          name: item.name,
          barcode: item.barcode,
          quantity: item.quantity,
          planned: planOf(item)?.quantity ?? null,
          cost: orderCostOf(item),
          stockoutDate: item.stockoutDate,
        })),
      ),
    )
  }

  return (
    <div className={styles.page}>
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
        {!(noResult || refreshRequired) &&
          (lock ? (
            <LockedButton>수불부 업로드</LockedButton>
          ) : (
            <Button onClick={() => navigate('/upload')}>수불부 업로드</Button>
          ))}
      </header>

      {/* 보여 줄 숫자가 없을 땐 "—" 카드 네 장 대신 안내 카드 하나만(11/2 결정) */}
      {!(noResult || refreshRequired) && (
        <div
          aria-label="상품 나눠 보기"
          className={styles.summary}
          onKeyDown={moveTab}
          role="tablist"
        >
          {(
            [
              [
                'need',
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
                'safe',
                '아직 괜찮아요',
                data.summary.safe,
                'safe',
                soonCount > 0
                  ? `그중 ${soonCount}개는 곧 넣어야 해요`
                  : '지금 발주가 급한 상품은 아니에요',
              ],
              [
                'na',
                '계산 불가',
                data.summary.unavailable,
                'unavailable',
                '판매 기록이 부족해요',
              ],
              [
                'ex',
                '검산 제외',
                data.summary.excluded,
                'excluded',
                '재고 숫자가 맞지 않아요',
              ],
            ] as const
          ).map(([key, label, value, state, note]) => (
            <SummaryCard
              key={key}
              label={label}
              note={note}
              onSelect={() => selectTab(key)}
              selected={tab === key}
              state={state}
              tab={key}
              value={value}
            />
          ))}
        </div>
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
        <section
          aria-labelledby={`dashboard-tab-${tab}`}
          className={styles.panel}
          data-tab={tab}
          id="dashboard-list"
          role="tabpanel"
        >
          <span aria-hidden="true" className={styles.notch} />
          <div className={styles.sectionHeader}>
            <div>
              <h2>
                {PANEL_TITLE[tab]}
                <span className={styles.count}>{tabCount[tab]}개</span>
              </h2>
              <p>{PANEL_DESCRIPTION[tab]}</p>
              {tab === 'need' && <StorageTotal items={items} />}
            </div>
            <div className={styles.tools}>
              <label className={styles.search}>
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-4-4" />
                </svg>
                <input
                  aria-label="목록에서 상품 찾기"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="상품명·바코드"
                  type="search"
                  value={search}
                />
              </label>
              {tab === 'need' && items.length > 0 && (
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
              )}
            </div>
          </div>

          {tab === 'need' &&
            (items.length === 0 ? (
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
            ) : shownNeed.length === 0 ? (
              <NoMatch search={search} />
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th className={styles.pick}>
                        <input
                          aria-label="보이는 상품 모두 고르기"
                          checked={shownNeed.every((item) =>
                            picked.has(item.id),
                          )}
                          onChange={(event) => pickAll(event.target.checked)}
                          ref={(node) => {
                            if (node)
                              node.indeterminate =
                                !node.checked &&
                                shownNeed.some((item) => picked.has(item.id))
                          }}
                          type="checkbox"
                        />
                      </th>
                      <th>상품</th>
                      <th>예상 소진일</th>
                      <th className={styles.num}>리드타임</th>
                      <th className={styles.num}>품절 위험</th>
                      <th className={styles.num}>권장 입고량</th>
                      <th className={styles.num}>내 입고량</th>
                      <th className={styles.num}>사입비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownNeed.map((item) => (
                      // 줄 전체를 눌러 상세로 간다. 키보드·화면 읽기용으로 상품명은 링크로 둔다.
                      <tr
                        className={styles.rowLink}
                        data-passed={
                          daysPast(item.stockoutDate) > 0 || undefined
                        }
                        data-picked={picked.has(item.id) || undefined}
                        key={item.id}
                        onClick={() => navigate(`/sku/${item.id}`)}
                      >
                        <td
                          className={styles.pick}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            aria-label={`${item.name} 발주 목록에 넣기`}
                            checked={picked.has(item.id)}
                            onChange={() => togglePick(item.id)}
                            type="checkbox"
                          />
                        </td>
                        <td className={styles.nameCell}>
                          <div className={styles.nameLine}>
                            <Link to={`/sku/${item.id}`}>{item.name}</Link>
                            {daysPast(item.stockoutDate) > 0 && (
                              <SoldOutStamp />
                            )}
                          </div>
                          <span>{item.barcode}</span>
                        </td>
                        <td data-label="예상 소진일">
                          {item.stockoutDate === '—' ? (
                            <EmptyValue kind="short" />
                          ) : (
                            item.stockoutDate
                          )}
                          <LateText days={daysPast(item.stockoutDate)} />
                        </td>
                        <td className={styles.num} data-label="리드타임">
                          {item.leadTime == null ? (
                            <EmptyValue kind="unset" />
                          ) : (
                            `${item.leadTime}일`
                          )}
                        </td>
                        <td className={styles.num} data-label="품절 위험">
                          {item.risk == null ? (
                            <EmptyValue kind="short" />
                          ) : (
                            `${item.risk}%`
                          )}
                        </td>
                        <td
                          className={`${styles.num} ${styles.qtyCell}`}
                          data-label="권장 입고량"
                        >
                          <span
                            className={styles.qty}
                            data-struck={struck(item) || undefined}
                          >
                            {item.quantity}개
                          </span>
                        </td>
                        <td className={styles.num} data-label="내 입고량">
                          {planCell(item)}
                        </td>
                        <td className={styles.num} data-label="사입비">
                          {orderCostOf(item).toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {tab === 'safe' &&
            (!data.safeItems && products.isError ? (
              <AsyncState
                description="상품 목록을 확인하지 못했어요. 다시 불러와 주세요."
                onRetry={() => void products.refetch()}
                status="error"
                title="아직 괜찮은 상품을 불러오지 못했어요"
              />
            ) : !data.safeItems && products.isPending ? (
              <p className={styles.none}>상품을 불러오고 있어요.</p>
            ) : safeItems.length === 0 ? (
              <p className={styles.none}>아직 괜찮은 상품이 없어요.</p>
            ) : shownSafe.length === 0 ? (
              <NoMatch search={search} />
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>상품</th>
                      <th>예상 소진일</th>
                      <th>
                        주문까지{' '}
                        <small className={styles.headHint}>한 칸 = 1주</small>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownSafe.map((item) => {
                      const room = slack(item)
                      const soon = room !== null && room <= SOON_DAYS
                      const deadline = orderDeadline(room ?? 0)
                      return (
                        <tr
                          className={styles.rowLink}
                          data-soon={soon || undefined}
                          key={item.id}
                          onClick={() => navigate(`/sku/${item.id}`)}
                        >
                          <td className={styles.nameCell}>
                            <div className={styles.nameLine}>
                              <Link to={`/sku/${item.id}`}>{item.name}</Link>
                              {soon && (
                                <span className={styles.soon}>
                                  곧 넣어야 해요
                                </span>
                              )}
                            </div>
                            <span>{item.barcode}</span>
                          </td>
                          <td data-label="예상 소진일">
                            {item.stockoutDate === '—' ? (
                              <span className={styles.muted}>—</span>
                            ) : (
                              item.stockoutDate
                            )}
                          </td>
                          <td data-label="주문까지">
                            {room === null ? (
                              <span className={styles.muted}>—</span>
                            ) : (
                              <span
                                aria-label={`주문까지 ${room}일, ${deadline.long}까지`}
                                className={styles.room}
                                role="group"
                              >
                                <span
                                  aria-hidden="true"
                                  className={styles.weeks}
                                >
                                  {[0, 1, 2, 3].map((cell) => (
                                    <i
                                      data-on={
                                        cell < Math.ceil(room / 7) || undefined
                                      }
                                      key={cell}
                                    />
                                  ))}
                                </span>
                                <span
                                  aria-hidden="true"
                                  className={styles.roomText}
                                >
                                  <b>{room}일</b>
                                  <small>{deadline.short}까지</small>
                                </span>
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}

          {(tab === 'na' || tab === 'ex') &&
            (reasonItems.length === 0 ? (
              <p className={styles.none}>
                {tab === 'na'
                  ? '계산 못 한 상품은 없어요.'
                  : '검산에서 뺀 상품은 없어요.'}
              </p>
            ) : shownReasons.length === 0 ? (
              <NoMatch search={search} />
            ) : (
              <ul className={styles.reasons}>
                {shownReasons.map((item) => (
                  <li key={item.id ?? item.name}>
                    <div className={styles.nameCell}>
                      {item.id ? (
                        <Link to={`/sku/${item.id}`}>{item.name}</Link>
                      ) : (
                        <strong>{item.name}</strong>
                      )}
                    </div>
                    <div className={styles.reasonText}>
                      {'date' in item &&
                        typeof item.date === 'string' &&
                        item.date && (
                          <small className={styles.errorDate}>
                            오류 자료 날짜 {item.date}
                          </small>
                        )}
                      <span>{calculationReason(item.reason)}</span>
                      <ReasonDetail reason={item.reason} />
                    </div>
                    {tab === 'ex' && (
                      <Button
                        onClick={() => navigate('/upload')}
                        variant="secondary"
                      >
                        수불부 다시 올리기
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'need' && pickedItems.length > 0 && (
            <div
              aria-label="발주 목록"
              className={styles.orderBar}
              role="region"
            >
              <b aria-live="polite">
                {pickedItems.length}개 골랐어요 · {pickedQty}개
              </b>
              <span>사입비 {pickedCost.toLocaleString()}원</span>
              <Button onClick={() => setPicked(new Set())} variant="text">
                선택 해제
              </Button>
              <Button onClick={exportOrder}>엑셀로 받기</Button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
