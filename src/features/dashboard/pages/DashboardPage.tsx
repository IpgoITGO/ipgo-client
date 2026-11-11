import { useQuery } from '@tanstack/react-query'
import {
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { useCalculation } from '../../../shared/api/calculationContext'

import {
  calculationReason,
  inventoryMismatch,
} from '../../../shared/lib/calculationReason'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { EmptyValue } from '../../../shared/ui/EmptyValue/EmptyValue'
import { useCountUp } from '../../../shared/hooks/useCountUp'
import { Button } from '../../../shared/ui/Button/Button'
import { LockedButton } from '../../billing/components/LockedButton'
import { useCalcLock } from '../../billing/model/useCalcLock'
import { SoldOutStamp } from '../../../shared/ui/SoldOut/SoldOut'
import { Tape } from '../../../shared/ui/Tape/Tape'
import {
  useStorageSettings,
  storageCostTotal,
  STORAGE_LINK,
} from '../../settings/model/storageCost'
import {
  isOwnPlan,
  isStale,
  shortBasis,
  usePlannedQuery,
} from '../../sku/model/plannedQuantity'
import { getAllProducts } from '../../settings/model/plannedReceiptsApi'
import {
  nearestByProduct,
  type ProductExpiry,
  shortExpiry,
  useExpiry,
} from '../../expiry/model/expiryApi'
import { getDashboard } from '../model/dashboardApi'
import { downloadCsv, orderFileName, toOrderCsv } from '../model/orderCsv'
import { shortDate } from '../../../shared/lib/elapsed'
import { BusyStrip } from './BusyStrip'
import { DashboardSkeleton } from './DashboardSkeleton'
import { mostUrgent } from '../model/mostUrgent'
import styles from './DashboardPage.module.css'

// 보관 비용(#185): 입고 필요 상품을 권장 수량대로 넣으면 한 달 보관비가 얼마인지 한 줄로.
// 크기를 안 넣은 상품은 0원으로 더하지 않고 개수만 따로 적는다.
function StorageTotal({
  items,
}: {
  items: Array<{ id: string; quantity: number | null }>
}) {
  const settings = useStorageSettings()
  const { total, missing, counted } = storageCostTotal(items, settings)
  // 상태마다 다른 한 줄(11/10): 요율 없음 → 넣기 칸 / 요율은 있는데 상자 크기가 하나도 없음 → 그 사실을 적음 / 일부 → 합계
  if (settings.ratePerCbm != null && items.length === 0) return null
  if (settings.ratePerCbm != null && counted === 0) {
    return (
      <p className={styles.storageLine}>
        요율 {settings.ratePerCbm.toLocaleString()}원 · 지금 넣을 {items.length}
        개 중 상자 크기가 있는 상품이 없어요{' '}
        <Link to={STORAGE_LINK}>크기 넣기 →</Link>
      </p>
    )
  }
  if (settings.ratePerCbm == null) {
    return (
      // 아직 안 넣었으면 문장 대신 누를 곳이 보이는 작은 칸 하나(11/5 — 줄글은 지저분하고 안 눌림)
      <Link className={styles.storageCta} to={STORAGE_LINK}>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
          <path d="M3 8l9 5 9-5M12 13v8" />
        </svg>
        한 달 보관비 보기
        <small>요율·상자 크기 넣기</small>
      </Link>
    )
  }
  return (
    <p className={styles.storageLine}>
      다 넣으면 한 달 보관비 <b>{total.toLocaleString()}원</b>
      {missing > 0 && (
        <span>
          {' '}
          · {missing}개는 상자 크기 없어 빠짐{' '}
          <Link to={STORAGE_LINK}>넣기 →</Link>
        </span>
      )}
    </p>
  )
}

export type DashboardData = {
  runId?: number | null
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
// 11/10: 계산 불가·검산 제외를 "계산 못 해요" 한 장으로 합치고, 목록 위 줄에 "전체"를 둔다
const TABS = ['need', 'safe', 'na'] as const
type CardTab = (typeof TABS)[number]
type Tab = CardTab | 'all'
const LIST_TABS: Tab[] = ['all', 'need', 'safe', 'na']
// 여유(소진일 − 오늘 − 리드타임)가 이 날수 이하면 "곧 넣어야 해요"
const SOON_DAYS = 7
// 이 이상이면 품절 위험 숫자를 빨갛게(상품 상세 시나리오 카드와 같은 20%)
const HIGH_RISK = 20

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
  tab: CardTab
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
    <small className={styles.cellSub} data-tone="danger">
      {days === 0 ? '오늘 소진' : `${days}일 지남`}
    </small>
  )
}

// 유통기한 칸: 예상 소진일 칸과 같은 모양(11/11) — 굵은 날짜 + 아래 작은 색 글씨.
// 지났으면 빨강 "N일 지남", 임박이면 주황 "D-n", 넉넉하면 날짜만, 모르면 —
function ExpiryCell({ expiry }: { expiry?: ProductExpiry }) {
  if (!expiry) return <span className={styles.muted}>—</span>
  return (
    <>
      <span className={styles.dateMain}>{shortExpiry(expiry.expiryDate)}</span>
      {expiry.status !== 'OK' && (
        <small
          className={styles.cellSub}
          data-tone={expiry.status === 'EXPIRED' ? 'danger' : 'warn'}
        >
          {expiry.status === 'EXPIRED'
            ? `${-expiry.daysLeft}일 지남`
            : `D-${expiry.daysLeft}`}{' '}
          · {expiry.remainingQty}개 남음
        </small>
      )}
    </>
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
  na: '계산 못 한 상품',
  all: '전체 상품',
}

const PANEL_DESCRIPTION: Record<Tab, string> = {
  need: '오늘 기준 리드타임 안에 재고가 떨어질 상품이에요.',
  safe: '다음 입고 전에 재고가 버텨요. 소진일이 가까운 순이에요.',
  na: '판매 기록이 부족하거나 수불부의 재고 숫자가 맞지 않아 계산하지 못했어요.',
  all: '올린 수불부의 상품 전체예요. 급한 순으로 묶어 보여 줘요.',
}

const LIST_LABEL: Record<Tab, string> = {
  all: '전체',
  need: '지금 넣기',
  safe: '괜찮아요',
  na: '계산 못 해요',
}
const KIND_LABEL = { need: '지금 넣기', safe: '괜찮아요', na: '계산 못 해요' }

// 2026-11-07 · 2026. 11. 7 → 11/7
function slashDay(date: string) {
  const m = /\d{4}\D+(\d{1,2})\D+(\d{1,2})/.exec(date)
  return m ? `${Number(m[1])}/${Number(m[2])}` : date
}

// 계산 못 한 이유: 상품명 아래 회색 한 줄(11/11 시안 2안). 재고가 안 맞으면 날짜·차이 + 작은 링크,
// 풀이·고칠 일은 줄에 마우스를 올리면(title) 보이고, 자세한 건 상품 상세에서
function NaReason({
  item,
}: {
  item: { kind: 'na' | 'ex'; reason: string; date?: string }
}) {
  const mismatch = item.kind === 'ex' ? inventoryMismatch(item.reason) : null
  const date = item.date ? `${slashDay(item.date)} ` : ''
  const text = mismatch
    ? `${date}재고가 ${Math.abs(mismatch.diff)}개 안 맞아요`
    : item.kind === 'ex'
      ? `${date}재고 숫자가 안 맞아요`
      : calculationReason(item.reason)
  return (
    <small
      className={styles.naReason}
      title={mismatch ? `${mismatch.explain} ${mismatch.todo}` : undefined}
    >
      {text}
      {item.kind === 'ex' && (
        <Link
          className={styles.naLink}
          onClick={(event) => event.stopPropagation()}
          to="/upload"
        >
          수불부 다시 올리기 →
        </Link>
      )}
    </small>
  )
}

function NoMatch({ search }: { search: string }) {
  return <p className={styles.none}>"{search}"에 맞는 상품이 없어요.</p>
}

export function DashboardPage() {
  const plannedQuery = usePlannedQuery()
  const planned = plannedQuery.data ?? {}
  const navigate = useNavigate()
  const lock = useCalcLock()
  const [params, setParams] = useSearchParams()
  const calculation = useCalculation()
  // 계산 중엔 지난 숫자 대신 스켈레톤. 오래 걸리면 "지난 결과 보기"로 열 수 있고, 끝나면 다시 닫힌다
  const busy = ['checking', 'pending', 'updating'].includes(calculation.phase)
  const [showPast, setShowPast] = useState(false)
  // 엑셀을 받으면 버튼이 1.6초 "✓ 받았어요"(11/11)
  const [exported, setExported] = useState(false)
  useEffect(() => {
    if (!exported) return
    const timer = setTimeout(() => setExported(false), 1600)
    return () => clearTimeout(timer)
  }, [exported])
  if (!busy && showPast) setShowPast(false)
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
  // 전체 탭에서 고른 "괜찮아요" 상품의 수량(친 글자 그대로). 안 쳤으면 내 입고량, 그것도 없으면 빈칸
  const [safeQty, setSafeQty] = useState<Record<string, string>>({})
  const tabParam = params.get('tab')
  // 예전 주소 ?tab=ex 는 합친 "계산 못 해요"로
  const tab: Tab =
    tabParam === 'ex'
      ? 'na'
      : (LIST_TABS.find((value) => value === tabParam) ?? 'need')
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    // 첫 업로드는 입고 조건을 확정하기 전이라 서버가 계산을 시작하지 않는다 → 지켜볼 계산이 없어
    // 확인이 끝나도 "확인 중"에 멈춰 보였다(11/6). 확인 중인 동안은 스스로 다시 불러온다.
    refetchInterval: (q) =>
      q.state.data?.uploadStatus === 'PROCESSING' ? 3000 : false,
  })
  // 서버가 아직 괜찮은 상품 목록을 주기 전(#103)에는 상품 목록에서 나머지를 채운다
  const products = useQuery({
    queryKey: ['products', 'dashboard-safe'],
    queryFn: getAllProducts,
    enabled:
      (tab === 'safe' || tab === 'all') &&
      query.data !== undefined &&
      !query.data.safeItems,
  })

  // 유통기한(ipgo-server#168). 서버가 아직 없으면 칸은 "—"
  const expiryQuery = useExpiry()
  const expiryOf = useMemo(
    () => nearestByProduct(expiryQuery.data?.items ?? []),
    [expiryQuery.data],
  )

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
    const at = tab === 'all' ? 0 : TABS.indexOf(tab)
    const next = TABS[(at + step) % TABS.length]
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
  // 계산 못 한 상품: 판매 기록 부족(na) 먼저, 재고 숫자 안 맞음(ex) 다음
  const reasonItems = [
    ...data.unavailableItems.map((item) => ({ ...item, kind: 'na' as const })),
    ...data.excludedItems.map((item) => ({ ...item, kind: 'ex' as const })),
  ]
  const shownReasons = reasonItems.filter(matches)
  const tabCount: Record<Tab, number> = {
    need: data.summary.needed,
    safe: data.safeItems ? safeItems.length : data.summary.safe,
    na: data.summary.unavailable + data.summary.excluded,
    all:
      data.summary.needed +
      (data.safeItems ? safeItems.length : data.summary.safe) +
      data.summary.unavailable +
      data.summary.excluded,
  }
  const naNote =
    [
      data.summary.unavailable > 0 &&
        `판매 기록 부족 ${data.summary.unavailable}`,
      data.summary.excluded > 0 && `재고 숫자 안 맞음 ${data.summary.excluded}`,
    ]
      .filter(Boolean)
      .join(' · ') || '계산 못 한 상품이 없어요'

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
    return !!plan && !isStale(plan, data.runId)
  }
  const planCell = (item: { id: string }) => {
    const plan = planOf(item)
    if (!plan) return '—'
    return (
      <>
        <b>{plan.quantity.toLocaleString()}개</b>
        {isStale(plan, data.runId) ? (
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
  // 괜찮은 상품은 권장량·단가가 없다 → 수량은 직접 적은 값, 사입비 합계에서는 빠진다
  const pickedSafe = safeItems.filter((item) => picked.has(item.id))
  const safeQtyText = (id: string) =>
    safeQty[id] ?? planOf({ id })?.quantity.toString() ?? ''
  const safeQtyOf = (id: string) => Number(safeQtyText(id)) || null
  const pickedCount = pickedItems.length + pickedSafe.length
  const pickedQty =
    pickedItems.reduce((sum, item) => sum + orderQtyOf(item), 0) +
    pickedSafe.reduce((sum, item) => sum + (safeQtyOf(item.id) ?? 0), 0)
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
  // 모든 탭이 같은 줄 모양. 정렬은 모든 줄에 같은 기준(모르는 값은 뒤로), 같으면 지금 넣기 → 괜찮음 → 계산 못 함
  type Row =
    | {
        kind: 'need'
        id: string
        name: string
        barcode: string
        item: (typeof items)[number]
      }
    | {
        kind: 'safe'
        id: string
        name: string
        barcode: string
        item: (typeof safeItems)[number]
      }
    | {
        kind: 'na'
        id: string | undefined
        name: string
        barcode: string
        item: (typeof reasonItems)[number]
      }
  const needRows: Row[] = shownNeed.map((item) => ({
    kind: 'need',
    id: item.id,
    name: item.name,
    barcode: item.barcode,
    item,
  }))
  const safeRows: Row[] = shownSafe.map((item) => ({
    kind: 'safe',
    id: item.id,
    name: item.name,
    barcode: item.barcode,
    item,
  }))
  const naRows: Row[] = shownReasons.map((item) => ({
    kind: 'na',
    id: item.id,
    name: item.name,
    barcode: '',
    item,
  }))
  const KIND_ORDER = { need: 0, safe: 1, na: 2 }
  const rowDate = (row: Row) =>
    row.kind === 'na' || row.item.stockoutDate === '—'
      ? '99999999'
      : dateKey(row.item.stockoutDate)
  const rowRisk = (row: Row) =>
    row.kind === 'need' ? (row.item.risk ?? -1) : -1
  const rowCost = (row: Row) =>
    row.kind === 'need' ? orderCostOf(row.item) : -1
  const rows = (
    tab === 'need'
      ? needRows
      : tab === 'safe'
        ? safeRows
        : tab === 'na'
          ? naRows
          : [...needRows, ...safeRows, ...naRows]
  )
    .slice()
    .sort(
      (a, b) =>
        (sort === 'cost'
          ? rowCost(b) - rowCost(a)
          : sort === 'risk'
            ? rowRisk(b) - rowRisk(a)
            : rowDate(a).localeCompare(rowDate(b))) ||
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
    )
  const pickable = rows.filter(
    (row): row is Row & { id: string } => row.kind !== 'na' && Boolean(row.id),
  )
  function pickRows(checked: boolean) {
    setPicked((previous) => {
      const next = new Set(previous)
      pickable.forEach((row) =>
        checked ? next.add(row.id) : next.delete(row.id),
      )
      return next
    })
  }
  function exportOrder() {
    if (!plannedQuery.isSuccess) return
    downloadCsv(
      orderFileName(),
      toOrderCsv([
        ...pickedItems.map((item) => ({
          name: item.name,
          barcode: item.barcode,
          quantity: item.quantity,
          planned: planOf(item)?.quantity ?? null,
          cost: orderCostOf(item),
          stockoutDate: item.stockoutDate,
        })),
        ...pickedSafe.map((item) => ({
          name: item.name,
          barcode: item.barcode,
          quantity: null,
          planned: safeQtyOf(item.id),
          cost: null,
          stockoutDate: item.stockoutDate,
        })),
      ]),
    )
    setExported(true)
  }

  // 같은 자리에 BusyStrip을 두어 끝났을 때 "바꿨어요" 한 줄이 이어진다
  if (busy && !showPast)
    return (
      <div className={styles.page}>
        <BusyStrip
          baseDate={noResult ? undefined : data.baseDate}
          onShowPast={() => setShowPast(true)}
        />
        <DashboardSkeleton
          note={
            noResult
              ? undefined
              : {
                  baseDate: data.baseDate,
                  top: mostUrgent(data.neededItems),
                  needed: data.summary.needed,
                  soon: data.neededItems.filter(
                    (item) => dayNumber(item.stockoutDate) < today + 7,
                  ).length,
                  planned: Object.values(planned).filter(isOwnPlan).length,
                }
          }
        />
      </div>
    )

  return (
    <div className={styles.page}>
      <BusyStrip baseDate={noResult ? undefined : data.baseDate} />
      {plannedQuery.isError && (
        <p role="alert">
          내 입고량을 불러오지 못했어요. 주문 수량을 확인하기 전에는 엑셀을 받을
          수 없어요.
          <Button onClick={() => void plannedQuery.refetch()} variant="text">
            다시 불러오기
          </Button>
        </p>
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
          <div className={styles.titleRow}>
            <h1>
              {noResult
                ? '아직 계산한 결과가 없어요'
                : refreshRequired
                  ? '수불부를 올리면 다시 계산해요'
                  : `지금 넣어야 할 상품이 ${data.summary.needed}개 있어요`}
            </h1>
          </div>
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
                '계산 못 해요',
                data.summary.unavailable + data.summary.excluded,
                'unavailable',
                naNote,
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
          aria-labelledby={
            tab === 'all' ? 'dashboard-list-all' : `dashboard-tab-${tab}`
          }
          className={styles.panel}
          data-tab={tab}
          id="dashboard-list"
          role="tabpanel"
        >
          {tab !== 'all' && (
            <span aria-hidden="true" className={styles.notch} />
          )}
          {/* 위 카드 셋 + "전체". 카드를 누르지 않아도 전체를 한 표로 본다(11/10) */}
          <div
            aria-label="목록 고르기"
            className={styles.listTabs}
            role="group"
          >
            {LIST_TABS.map((key) => (
              <button
                aria-pressed={tab === key}
                id={`dashboard-list-${key}`}
                key={key}
                onClick={() => selectTab(key)}
                type="button"
              >
                {LIST_LABEL[key]} <b>{tabCount[key].toLocaleString()}</b>
              </button>
            ))}
          </div>
          <div className={styles.sectionHeader}>
            <div>
              <h2>
                {PANEL_TITLE[tab]}
                <span className={styles.count}>{tabCount[tab]}개</span>
              </h2>
              <p>{PANEL_DESCRIPTION[tab]}</p>
              {/* 보관비 줄 자리는 탭마다 잡아 두어 검색칸·표가 위아래로 안 움직인다 */}
              <div className={styles.storageSlot}>
                {(tab === 'need' || tab === 'all') && (
                  <StorageTotal items={items} />
                )}
              </div>
            </div>
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
          </div>
          <div aria-label="목록 정렬" className={styles.sort} role="radiogroup">
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

          {/* 모든 탭이 같은 칸·같은 폭(11/11). 탭은 줄만 거르고, 계산 못 한 상품은 이유를 줄 아래에 */}
          {tab === 'need' && items.length === 0 ? (
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
          ) : (tab === 'safe' || tab === 'all') &&
            !data.safeItems &&
            products.isError ? (
            <AsyncState
              description="상품 목록을 확인하지 못했어요. 다시 불러와 주세요."
              onRetry={() => void products.refetch()}
              status="error"
              title="아직 괜찮은 상품을 불러오지 못했어요"
            />
          ) : tab === 'safe' && !data.safeItems && products.isPending ? (
            <p className={styles.none}>상품을 불러오고 있어요.</p>
          ) : rows.length === 0 ? (
            search ? (
              <NoMatch search={search} />
            ) : (
              <p className={styles.none}>
                {tab === 'safe'
                  ? '아직 괜찮은 상품이 없어요.'
                  : tab === 'na'
                    ? '계산 못 한 상품은 없어요.'
                    : '아직 상품이 없어요.'}
              </p>
            )
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.unified}>
                <colgroup>
                  <col className={styles.cPick} />
                  <col />
                  <col className={styles.cKind} />
                  <col className={styles.cDate} />
                  <col className={styles.cRisk} />
                  <col className={styles.cExpiry} />
                  <col className={styles.cQty} />
                  <col className={styles.cCost} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={styles.pick}>
                      <input
                        aria-label="보이는 상품 모두 고르기"
                        checked={
                          pickable.length > 0 &&
                          pickable.every((row) => picked.has(row.id))
                        }
                        disabled={pickable.length === 0}
                        onChange={(event) => pickRows(event.target.checked)}
                        ref={(node) => {
                          if (node)
                            node.indeterminate =
                              !node.checked &&
                              pickable.some((row) => picked.has(row.id))
                        }}
                        type="checkbox"
                      />
                    </th>
                    <th>상품</th>
                    <th>상태</th>
                    <th>예상 소진일</th>
                    <th className={styles.num}>품절 위험</th>
                    <th>유통기한</th>
                    <th className={styles.num}>입고량</th>
                    <th className={styles.num}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const passed =
                      row.kind === 'need' && daysPast(row.item.stockoutDate) > 0
                    const room = row.kind === 'safe' ? slack(row.item) : null
                    const soon = room !== null && room <= SOON_DAYS
                    const expiry = row.id ? expiryOf.get(row.id) : undefined
                    return (
                      <Fragment key={`${row.kind}-${row.id ?? row.name}`}>
                        {/* 줄 어디를 눌러도 상품 상세로(체크박스·수량 칸만 빼고). 키보드·화면 읽기용으로 상품명은 링크 */}
                        <tr
                          className={row.id ? styles.rowLink : undefined}
                          data-kind={row.kind}
                          data-passed={passed || undefined}
                          data-picked={picked.has(row.id ?? '') || undefined}
                          data-soon={soon || undefined}
                          onClick={
                            row.id
                              ? () => navigate(`/sku/${row.id}`)
                              : undefined
                          }
                        >
                          <td
                            className={styles.pick}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {/* 괜찮은 상품도 같이 발주할 수 있게 고를 수 있다(11/10). 계산 못 한 상품만 막는다 */}
                            <input
                              aria-label={
                                row.kind === 'na'
                                  ? `${row.name}은 계산을 못 해 고를 수 없어요`
                                  : `${row.name} 발주 목록에 넣기`
                              }
                              checked={picked.has(row.id ?? '')}
                              disabled={row.kind === 'na' || !row.id}
                              onChange={() => row.id && togglePick(row.id)}
                              type="checkbox"
                            />
                          </td>
                          <td className={styles.nameCell}>
                            <div className={styles.nameLine}>
                              {row.id ? (
                                <Link to={`/sku/${row.id}`}>{row.name}</Link>
                              ) : (
                                <strong>{row.name}</strong>
                              )}
                              {passed && <SoldOutStamp />}
                              {soon && (
                                <span className={styles.soon}>
                                  곧 넣어야 해요
                                </span>
                              )}
                            </div>
                            {row.barcode && <span>{row.barcode}</span>}
                            {/* 계산 못 한 이유: 상자 없이 이름 아래 회색 한 줄 + 작은 링크(11/11 시안 2안) */}
                            {row.kind === 'na' && <NaReason item={row.item} />}
                          </td>
                          <td data-label="상태">
                            <span className={styles.kind} data-kind={row.kind}>
                              {KIND_LABEL[row.kind]}
                            </span>
                          </td>
                          <td data-label="예상 소진일">
                            {row.kind === 'na' ||
                            row.item.stockoutDate === '—' ? (
                              <span className={styles.muted}>—</span>
                            ) : (
                              <span className={styles.dateMain}>
                                {slashDay(row.item.stockoutDate)}
                              </span>
                            )}
                            {row.kind === 'need' &&
                              (daysPast(row.item.stockoutDate) >= 0 ? (
                                <LateText
                                  days={daysPast(row.item.stockoutDate)}
                                />
                              ) : (
                                <small className={styles.cellSub}>
                                  {row.item.leadTime == null
                                    ? '리드타임 미입력'
                                    : `리드타임 ${row.item.leadTime}일`}
                                </small>
                              ))}
                            {row.kind === 'safe' && room !== null && (
                              <span
                                aria-label={`주문까지 ${room}일, ${orderDeadline(room).long}까지`}
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
                                <small aria-hidden="true">
                                  주문까지 {room}일
                                </small>
                              </span>
                            )}
                          </td>
                          <td
                            className={`${styles.num} ${styles.riskCell}`}
                            data-label="품절 위험"
                          >
                            {row.kind === 'need' && row.item.risk != null ? (
                              // 소진일 날짜와 같은 굵기·크기. 높은 위험만 빨강(11/11 "품절 위험 폰트 별로")
                              <span
                                className={styles.dateMain}
                                data-high={
                                  row.item.risk >= HIGH_RISK || undefined
                                }
                              >
                                {row.item.risk}%
                              </span>
                            ) : row.kind === 'need' ? (
                              <EmptyValue kind="short" />
                            ) : (
                              <span className={styles.muted}>—</span>
                            )}
                          </td>
                          <td
                            className={styles.expiryCell}
                            data-label="유통기한"
                          >
                            <ExpiryCell expiry={expiry} />
                          </td>
                          <td
                            className={`${styles.num} ${styles.qtyCell}`}
                            data-label="입고량"
                            onClick={
                              row.kind === 'safe'
                                ? (event) => event.stopPropagation()
                                : undefined
                            }
                          >
                            {row.kind === 'need' ? (
                              <>
                                <span
                                  className={styles.qty}
                                  data-struck={struck(row.item) || undefined}
                                >
                                  {row.item.quantity.toLocaleString()}개
                                </span>
                                {planOf(row.item) && (
                                  <span className={styles.planBelow}>
                                    {planCell(row.item)}
                                  </span>
                                )}
                              </>
                            ) : row.kind === 'safe' &&
                              row.id &&
                              picked.has(row.id) ? (
                              // 권장량이 없는 줄: 고르면 수량 칸이 열린다. 비워 두면 엑셀에 빈칸
                              <label className={styles.safeQty}>
                                <input
                                  aria-label={`${row.name} 수량`}
                                  inputMode="numeric"
                                  onChange={(event) =>
                                    setSafeQty((previous) => ({
                                      ...previous,
                                      [row.id as string]: event.target.value
                                        .replace(/\D/g, '')
                                        .slice(0, 6),
                                    }))
                                  }
                                  value={safeQtyText(row.id)}
                                />
                                개
                              </label>
                            ) : (
                              <span className={styles.muted}>—</span>
                            )}
                          </td>
                          <td className={styles.num} data-label="금액">
                            {row.kind === 'need' ? (
                              `${orderCostOf(row.item).toLocaleString()}원`
                            ) : (
                              <span className={styles.muted}>—</span>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab !== 'na' && pickedCount > 0 && (
            <div
              aria-label="발주 목록"
              className={styles.orderBar}
              role="region"
            >
              <b aria-live="polite">
                {pickedCount}개 골랐어요 · {pickedQty}개
              </b>
              <span>
                사입비 {pickedCost.toLocaleString()}원
                {pickedSafe.length > 0 && ' · 지금 넣기 상품만'}
              </span>
              <Button onClick={() => setPicked(new Set())} variant="text">
                선택 해제
              </Button>
              <Button
                className={styles.exportButton}
                data-done={exported || undefined}
                disabled={!plannedQuery.isSuccess}
                onClick={exportOrder}
              >
                {exported ? '✓ 받았어요' : '엑셀로 받기'}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
