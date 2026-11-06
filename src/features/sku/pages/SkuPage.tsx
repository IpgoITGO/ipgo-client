import { useQuery } from '@tanstack/react-query'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '../../../shared/api/client'
import { calculationReason } from '../../../shared/lib/calculationReason'
import { ReasonDetail } from '../../../shared/ui/ReasonDetail/ReasonDetail'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { BoxLoader } from '../../../shared/ui/BoxLoader/BoxLoader'
import { EmptyValue } from '../../../shared/ui/EmptyValue/EmptyValue'
import { SoldOutStamp } from '../../../shared/ui/SoldOut/SoldOut'
import { Tape } from '../../../shared/ui/Tape/Tape'
import {
  accuracyStats,
  MIN_ACCURACY_ITEMS,
  type AccuracyItem,
} from '../model/accuracyStats'
import { monthDay } from '../../dashboard/model/dashboardApi'
import {
  cbmOf,
  formatCbm,
  loadStorageSettings,
  monthlyStorageCost,
  STORAGE_LINK,
} from '../../settings/model/storageCost'
import { ScenarioInsight } from '../components/ScenarioInsight'
import {
  getSkuDetail,
  type SettingSource,
  type SkuDetail,
} from '../model/skuApi'
import { niceStep, tickText } from '../model/trendScale'
import styles from './SkuPage.module.css'

const sourceLabels: Record<SettingSource, string> = {
  PRODUCT: '상품별',
  DEFAULT: '기본값',
  SUGGESTED: '제안값',
  ESTIMATED: '추정',
}

// 기획서 계산식: A = 작년 같은 시기 × 올해 최근 흐름, B = 최근 28일 평균. 화면에는 A·B 글자 대신 말로 쓴다.
function methodSentence(method: NonNullable<SkuDetail['method']>) {
  if (method.applied === 'A') return '작년 같은 시기와 최근 흐름으로 계산했어요'
  return method.fallback
    ? '작년 자료가 없어 최근 28일 평균으로 계산했어요'
    : '최근 28일 평균으로 계산했어요'
}

const count = (value: number | null) =>
  value == null ? '—' : `${value.toLocaleString()}개`

// 입고 조건 값(리드타임·발주 주기·입고 단위)이 비었으면 "—일" 대신 "미입력"
const setting = (value: number | null, unit: string) =>
  value == null ? (
    <EmptyValue kind="unset" />
  ) : (
    `${value.toLocaleString()}${unit}`
  )

// 재고·출고 추이 그래프(11/3~4 시안 C): 결론 한 문장을 위에 먼저 쓰고 그래프는 그 증거로 둔다.
// 재고는 선, 출고는 막대, 재고가 0인 날은 빨간 점, 오늘 뒤 "앞으로 N일"은 노란 칸(예상 출고 막대)과
// "이대로 나가면 줄어드는 재고"를 점선으로 그린다. 새 API 없이 마지막 재고와 앞으로 N일 합계로만 계산한다.
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const update = () => setWidth(Math.max(280, Math.round(node.clientWidth)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

const slashDate = (day: string, fallback: string) => {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(day)
  return match ? `${Number(match[1])}/${Number(match[2])}` : fallback
}

const perDayText = (value: number) =>
  value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)

type Pt = [number, number]
type Tone = 'danger' | 'ok' | 'ink'
type Tip = {
  title: string
  rows: Array<{ color: string; label: string; value: string }>
}
type Note = {
  tone: Tone
  x: number
  y: number
  main: string
  small: string[]
  arrow: [number, number, number, number] | null
}
type LegendItem = {
  kind: 'line' | 'dash' | 'bar' | 'dot' | 'band'
  color: string
  text: string
}
type View = {
  g: ReactNode
  count: number
  xs: (index: number) => number
  tip: (index: number) => Tip
  head: ReactNode
  sub: string
  legend: LegendItem[]
  note: Note | null
}

type TabKey = 'flow' | 'week' | 'ahead'
const tabLabels: Record<TabKey, string> = {
  flow: '재고·출고',
  week: '주별 출고',
  ahead: '앞으로 재고',
}

const INK = 'var(--color-primary)'
const BAD = 'var(--color-danger)'
const OK = 'var(--color-success)'
const MUTED = 'var(--color-text-3)'
const BAR = 'var(--color-chart-muted)'
const FUT = 'var(--color-accent)'
const toneColor: Record<Tone, string> = { danger: BAD, ok: OK, ink: INK }

// 선을 부드럽게 잇는다. 값이 튀지 않게 제어점은 이웃 두 점 높이 안에 가둔다.
function smooth(pts: Pt[]) {
  if (pts.length === 0) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [x0, y0] = pts[i - 1] ?? pts[i]
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const [x3, y3] = pts[i + 2] ?? pts[i + 1]
    const t = 0.18
    const lo = Math.min(y1, y2)
    const hi = Math.max(y1, y2)
    const c1 = Math.min(hi, Math.max(lo, y1 + (y2 - y0) * t))
    const c2 = Math.min(hi, Math.max(lo, y2 - (y3 - y1) * t))
    d += `C${x1 + (x2 - x0) * t},${c1} ${x2 - (x3 - x1) * t},${c2} ${x2},${y2}`
  }
  return d
}

// 위만 둥근 막대
const barPath = (x: number, w: number, yTop: number, base: number, r = 2.5) => {
  const rr = Math.min(r, w / 2, Math.max(0, base - yTop))
  return `M${x},${base}V${yTop + rr}q0,-${rr} ${rr},-${rr}h${w - 2 * rr}q${rr},0 ${rr},${rr}V${base}Z`
}

const mdOf = (ms: number) => {
  const d = new Date(ms)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

const noReduce = () =>
  typeof window.matchMedia === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

function Swatch({ kind, color }: { kind: LegendItem['kind']; color: string }) {
  return (
    <svg aria-hidden="true" className={styles.swatch} viewBox="0 0 22 12">
      {kind === 'line' && (
        <path
          d="M1 6H21"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="2"
        />
      )}
      {kind === 'dash' && (
        <path
          d="M1 6H21"
          stroke={color}
          strokeDasharray="4 3"
          strokeWidth="2"
        />
      )}
      {kind === 'bar' && (
        <rect fill={color} height="11" rx="2" width="8" x="7" y="1" />
      )}
      {kind === 'dot' && <circle cx="11" cy="6" fill={color} r="4.5" />}
      {kind === 'band' && (
        <rect fill={color} height="10" rx="2" width="20" x="1" y="1" />
      )}
    </svg>
  )
}

function NoteArrow({
  arrow,
  tone,
}: {
  arrow: [number, number, number, number]
  tone: Tone
}) {
  const [x1, y1, x2, y2] = arrow
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.2
  const my = (y1 + y2) / 2 - (x2 - x1) * 0.2
  const ang = Math.atan2(y2 - my, x2 - mx)
  const h = 8
  return (
    <g className={styles.arrow} style={{ color: toneColor[tone] }}>
      <path d={`M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`} pathLength="1" />
      <path
        d={`M${x2 - h * Math.cos(ang - 0.5)} ${y2 - h * Math.sin(ang - 0.5)}L${x2} ${y2}L${x2 - h * Math.cos(ang + 0.5)} ${y2 - h * Math.sin(ang + 0.5)}`}
        pathLength="1"
      />
    </g>
  )
}

function TrendChart({
  coverDays,
  forecastQty,
  history,
  leadDays,
  orderQty,
  shortageOn,
  startStock,
}: {
  coverDays: number
  forecastQty: number | null
  history: SkuDetail['history']
  leadDays: number | null
  orderQty: number
  shortageOn: string | null
  startStock: number | null
}) {
  const [wrapRef, width] = useWidth()
  const svgRef = useRef<SVGSVGElement>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [tab, setTab] = useState<TabKey>('flow')
  const [started, setStarted] = useState<TabKey | null>(null)
  const [finished, setFinished] = useState<TabKey | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const phone = width < 480
  const future = coverDays > 0 && forecastQty != null ? coverDays : 0
  const daily = future ? (forecastQty ?? 0) / future : 0
  const last = history.at(-1)
  const stock = last?.inventory ?? 0
  const tabs: TabKey[] =
    daily > 0 ? ['flow', 'week', 'ahead'] : ['flow', 'week']
  const active: TabKey = tabs.includes(tab) ? tab : 'flow'

  // 처음 한 번 그려진 뒤 핵심 한 곳만 짚는다. 움직임 줄이기면 끝난 모습을 바로 보여 준다.
  useEffect(() => {
    if (!noReduce()) {
      setStarted(active)
      setFinished(active)
      return
    }
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setStarted(active))
    })
    const timer = setTimeout(() => setFinished(active), 1350)
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
      clearTimeout(timer)
    }
  }, [active])
  const go = started === active
  const done = finished === active

  const height = (phone ? 250 : 280) + (active === 'week' ? 12 : 0)
  const box = {
    left: phone ? 36 : 44,
    right: width - 12,
    top: 34,
    bottom: height - (active === 'week' ? 60 : 48),
  }

  // 가로는 날짜 간격대로 둔다(기록이 주 단위여도 같은 자로 잰다). 날짜를 못 읽으면 순서대로.
  const first = Date.parse(history[0]?.day ?? '')
  const lastMs = Date.parse(last?.day ?? '')
  const dayAt = (index: number) => {
    const at = Date.parse(history[index]?.day ?? '')
    return Number.isNaN(first) || Number.isNaN(at)
      ? index
      : (at - first) / 864e5
  }
  const lastDay = history.length > 0 ? dayAt(history.length - 1) : 0
  const dateAfter = (days: number) =>
    Number.isNaN(lastMs)
      ? `+${Math.round(days)}일`
      : mdOf(lastMs + Math.round(days) * 864e5)
  const baseDate = last ? slashDate(last.day, last.date) : ''

  const daysLeft = daily > 0 ? stock / daily : Infinity
  const runsOut = future > 0 && stock > 0 && daysLeft <= future
  const outDays = Math.max(1, Math.round(daysLeft))
  const outText = Number.isFinite(daysLeft) ? `${dateAfter(outDays)}쯤` : ''
  const arrive = leadDays != null ? 1 + leadDays : null

  const axis = (top: number, step: number, y: (v: number) => number) => (
    <>
      {Array.from(
        { length: Math.round(top / step) + 1 },
        (_, i) => i * step,
      ).map((tick) => (
        <g key={tick}>
          <line
            className={tick === 0 ? styles.baseLine : styles.gl}
            x1={box.left}
            x2={box.right}
            y1={y(tick)}
            y2={y(tick)}
          />
          <text className={styles.tick2} x={box.left - 8} y={y(tick) + 4}>
            {tickText(tick)}
          </text>
        </g>
      ))}
      <text className={styles.unit} x={box.left - 8} y={box.top - 16}>
        개
      </text>
    </>
  )
  const ripple = (cx: number, cy: number, tone: Tone) => (
    <circle
      className={styles.ripple}
      cx={cx}
      cy={cy}
      r="6"
      style={{ stroke: toneColor[tone] }}
    />
  )
  // 위 문장과 서버 계산이 다르면 같은 문장 끝에 괄호로 붙인다(따로 빨간 경고를 두지 않는다).
  const head = (main: ReactNode) => (
    <>
      {main}
      {startStock != null && startStock !== stock && (
        <span className={styles.trendAside}>
          {' '}
          (서버는 시작 재고 {startStock.toLocaleString()}개 기준이라{' '}
          {shortageOn
            ? `${slashDate(shortageOn, shortageOn)} 소진으로 봐요`
            : '따로 계산해요'}
          )
        </span>
      )}
    </>
  )

  function flowView(): View {
    const max = Math.max(
      ...history.map((h) => Math.max(h.inventory, h.outbound)),
      daily,
      1,
    )
    const step = niceStep(max)
    const top = Math.ceil(max / step) * step
    const y = (v: number) => box.bottom - (v / top) * (box.bottom - box.top)
    const span = lastDay + future
    const perDay = span > 0 ? (box.right - box.left) / span : 0
    const xd = (d: number) => box.left + d * perDay
    const x = (i: number) => xd(dayAt(i))
    const gap =
      history.length > 1 ? (lastDay / (history.length - 1)) * perDay : 0
    const bw = Math.min(10, Math.max(gap * 0.4, 3))
    const todayX = x(history.length - 1)
    const zone = box.right - todayX
    const outX = xd(lastDay + daysLeft)
    const pts = history.map((h, i): Pt => [x(i), y(h.inventory)])
    const stockouts = history
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => h.inventory === 0)
    const fw = Math.max(2, Math.min(10, perDay * 0.55))
    const every = Math.max(1, Math.ceil(46 / Math.max(gap, 1)))
    const labels = history
      .map((_, i) => i)
      .filter((i) => (history.length - 1 - i) % every === 0)
    const focus: [number, number, Tone] | null = runsOut
      ? [outX, y(0), 'danger']
      : stock === 0
        ? [todayX, y(0), 'danger']
        : future > 0
          ? [todayX, y(stock), 'ink']
          : null

    const g = (
      <>
        {future > 0 && (
          <rect
            className={styles.futBand}
            height={box.bottom - box.top + 6}
            rx="6"
            width={zone}
            x={todayX}
            y={box.top - 6}
          />
        )}
        {stockouts.map(({ h, i }) => (
          <rect
            className={`${styles.outBand} ${styles.later}`}
            height="14"
            key={h.day}
            width={Math.max(gap, 4)}
            x={x(i) - Math.max(gap, 4) / 2}
            y={box.bottom - 14}
          />
        ))}
        {axis(top, step, y)}
        {history.map((h, i) =>
          h.outbound > 0 ? (
            <path
              className={`${styles.bar} ${styles.grow}`}
              d={barPath(x(i) - bw / 2, bw, y(h.outbound), box.bottom)}
              key={h.day}
              style={{ ['--i' as string]: i }}
            />
          ) : null,
        )}
        {future > 0 &&
          Array.from({ length: future }, (_, k) => (
            <path
              className={`${styles.bar} ${styles.barFut} ${styles.grow}`}
              d={barPath(
                xd(lastDay + k + 1) - fw / 2,
                fw,
                y(daily),
                box.bottom,
              )}
              key={k}
              style={{ ['--i' as string]: history.length + k }}
            />
          ))}
        {pts.length > 1 && (
          <path
            className={`${styles.area} ${styles.later}`}
            d={`${smooth(pts)}L${pts[pts.length - 1][0]},${box.bottom}L${pts[0][0]},${box.bottom}Z`}
          />
        )}
        <path
          className={`${styles.line} ${styles.draw}`}
          d={smooth(pts)}
          pathLength="1"
        />
        {runsOut && (
          <path
            className={`${styles.line} ${styles.later} ${styles.projLine}`}
            d={`M${todayX},${y(stock)}L${outX},${y(0)}`}
          />
        )}
        {stockouts.map(({ h, i }) => (
          <circle
            className={`${styles.dotRed} ${styles.later}`}
            cx={x(i)}
            cy={box.bottom}
            key={h.day}
            r="4.5"
          />
        ))}
        {stock > 0 && future > 0 && (
          <circle
            className={`${styles.dotInk} ${styles.later}`}
            cx={todayX}
            cy={y(stock)}
            r="4.5"
          />
        )}
        {runsOut && (
          <circle
            className={`${styles.dotRed} ${styles.later}`}
            cx={outX}
            cy={y(0)}
            r="5"
          />
        )}
        {focus && ripple(...focus)}
        {labels.map((i) => (
          <text
            className={
              i === history.length - 1 && future > 0 ? styles.xNow : styles.xt
            }
            key={history[i].day}
            x={x(i)}
            y={box.bottom + 20}
          >
            {slashDate(history[i].day, history[i].date)}
          </text>
        ))}
        {future > 0 && (
          <>
            {zone >= 44 && (
              <text
                className={styles.xt}
                style={{ textAnchor: 'end' }}
                x={box.right}
                y={box.bottom + 20}
              >
                {dateAfter(future)}
              </text>
            )}
            <text className={styles.xSmall} x={todayX} y={box.bottom + 36}>
              마지막 기록
            </text>
            {zone >= 96 && (
              <text
                className={`${styles.tag} ${styles.later}`}
                x={todayX + zone / 2}
                y={box.top + 8}
              >
                예상 하루 {perDayText(daily)}개
              </text>
            )}
          </>
        )}
      </>
    )

    let note: Note | null = null
    if (runsOut) {
      const small: string[] = []
      if (arrive != null) {
        const when = `${dateAfter(arrive)} 도착`
        small.push(
          arrive < daysLeft ? `지금 넣으면 ${when}` : `지금 넣어도 ${when}`,
          arrive < daysLeft
            ? `${Math.round(daysLeft - arrive)}일 여유`
            : '그사이 비어요',
        )
      }
      const nx = Math.min(box.right - 4, outX + 40)
      note = {
        tone: 'danger',
        x: nx,
        y: box.top + 30,
        main: `${outText} 바닥`,
        small,
        arrow: [
          nx - 12,
          box.top + 36 + small.length * 14 + 8,
          outX,
          Math.min(y(daily) - 7, y(0) - 9),
        ],
      }
    }

    const perDayWord = perDayText(daily)
    const mainHead =
      stock === 0 ? (
        <>
          <em>{baseDate} 기록 기준 재고가 없어요</em> · 하루 약 {perDayWord}
          개씩 나가요
        </>
      ) : runsOut ? (
        <>
          {baseDate} 기록 기준 재고 {stock.toLocaleString()}개 · 하루 약{' '}
          {perDayWord}개씩 나가면 <em>{outText} 바닥나요</em>
        </>
      ) : future > 0 ? (
        <>
          {baseDate} 기록 기준 재고 {stock.toLocaleString()}개 · 하루 약{' '}
          {perDayWord}개씩 나가도 <em>앞으로 {future}일은 버텨요</em>
        </>
      ) : (
        <>
          {baseDate} 기록 기준 재고 {stock.toLocaleString()}개예요
        </>
      )

    return {
      g,
      count: history.length + future,
      xs: (i) =>
        i < history.length ? x(i) : xd(lastDay + i - history.length + 1),
      tip: (i) =>
        i < history.length
          ? {
              title: slashDate(history[i].day, history[i].date),
              rows: [
                {
                  color: INK,
                  label: '재고',
                  value: `${history[i].inventory.toLocaleString()}개`,
                },
                {
                  color: BAR,
                  label: '출고',
                  value: `${history[i].outbound.toLocaleString()}개`,
                },
              ],
            }
          : {
              title: dateAfter(i - history.length + 1),
              rows: [
                {
                  color: FUT,
                  label: '예상 출고',
                  value: `${perDayWord}개`,
                },
                {
                  color: INK,
                  label: '예상 재고',
                  value: `${Math.max(0, Math.round(stock - daily * (i - history.length + 1))).toLocaleString()}개`,
                },
              ],
            },
      head: head(mainHead),
      sub:
        future > 0
          ? `노란 칸은 앞으로 ${future}일 예상이에요(합계 약 ${count(forecastQty)}).`
          : '지난 재고와 출고 기록이에요.',
      legend: [
        { kind: 'line', color: INK, text: '재고' },
        ...(runsOut
          ? [{ kind: 'dash' as const, color: INK, text: '예상 재고' }]
          : []),
        { kind: 'bar', color: BAR, text: '하루 출고' },
        ...(future > 0
          ? [{ kind: 'bar' as const, color: FUT, text: '예상 출고' }]
          : []),
        ...(stockouts.length > 0
          ? [
              {
                kind: 'band' as const,
                color: 'rgb(200 38 28 / 22%)',
                text: `재고 없던 날 ${stockouts.length}일`,
              },
            ]
          : []),
      ],
      note,
    }
  }

  function weekView(): View {
    const buckets = new Map<number, { v: number; out: number }>()
    history.forEach((h, i) => {
      const b = Math.floor(dayAt(i) / 7)
      const cur = buckets.get(b) ?? { v: 0, out: 0 }
      cur.v += h.outbound
      cur.out += h.inventory === 0 ? 1 : 0
      buckets.set(b, cur)
    })
    const keys = [...buckets.keys()].sort((a, b) => a - b)
    const weeks = keys.map((b) => {
      const w = buckets.get(b) ?? { v: 0, out: 0 }
      const startMs = first + b * 7 * 864e5
      const endMs = Math.min(startMs + 6 * 864e5, lastMs)
      return {
        ...w,
        label: Number.isNaN(startMs) ? `${b + 1}주` : mdOf(startMs),
        end: Number.isNaN(endMs) ? '' : mdOf(endMs),
        part: b === keys[keys.length - 1] && lastDay - b * 7 + 1 < 7,
      }
    })
    const full = weeks.filter((w) => !w.part && w.out === 0)
    const pool = full.length > 0 ? full : weeks.filter((w) => !w.part)
    const avg =
      pool.length > 0
        ? Math.round(pool.reduce((s, w) => s + w.v, 0) / pool.length)
        : null
    const peak = Math.max(...weeks.map((w) => w.v), avg ?? 0, 1)
    const step = niceStep(peak * 1.45)
    const top = Math.ceil((peak * 1.45) / step) * step
    const y = (v: number) => box.bottom - (v / top) * (box.bottom - box.top)
    const slot = (box.right - box.left) / weeks.length
    const bw = Math.min(24, slot * 0.5)
    const cx = (i: number) => box.left + slot * (i + 0.5)
    const every = Math.max(1, Math.ceil(46 / slot))
    const tipX = box.left + slot * (weeks.length - 1)

    const g = (
      <>
        {axis(top, step, y)}
        {weeks.map((w, i) => (
          <g key={w.label}>
            <path
              className={`${w.part || w.out ? styles.barPart : styles.bar} ${styles.grow}`}
              d={barPath(cx(i) - bw / 2, bw, y(w.v), box.bottom, 4)}
              style={{ ['--i' as string]: i * 5 }}
            />
            {i % every === 0 && (
              <>
                <text className={styles.xt} x={cx(i)} y={box.bottom + 19}>
                  {w.label}
                </text>
                {w.end && w.end !== w.label && (
                  <text className={styles.xSmall} x={cx(i)} y={box.bottom + 33}>
                    ~{w.end}
                  </text>
                )}
                {(w.out > 0 || w.part) && (
                  <text
                    className={`${styles.xSmall} ${styles.later}`}
                    style={w.out ? { fill: BAD, fontWeight: 700 } : undefined}
                    x={cx(i)}
                    y={box.bottom + 48}
                  >
                    {w.out ? `품절 ${w.out}일` : '덜 찬 주'}
                  </text>
                )}
              </>
            )}
          </g>
        ))}
        {avg != null && (
          <>
            <line
              className={`${styles.avgLine} ${styles.later}`}
              x1={box.left}
              x2={box.right}
              y1={y(avg)}
              y2={y(avg)}
            />
            {ripple(tipX, y(avg), 'ink')}
          </>
        )}
      </>
    )
    return {
      g,
      count: weeks.length,
      xs: cx,
      tip: (i) => ({
        title: `${weeks[i].label}–${weeks[i].end || weeks[i].label}`,
        rows: [
          {
            color: BAR,
            label: '출고',
            value: `${weeks[i].v.toLocaleString()}개`,
          },
          ...(weeks[i].out
            ? [
                {
                  color: BAD,
                  label: '재고 없던 날',
                  value: `${weeks[i].out}일`,
                },
              ]
            : []),
        ],
      }),
      head:
        avg != null ? (
          <>
            한 주에 평균{' '}
            <em className={styles.hlInk}>{avg.toLocaleString()}개</em> 나가요
          </>
        ) : (
          <>아직 한 주를 다 채운 기록이 없어요</>
        ),
      sub: '재고가 없던 날이 있는 주와 덜 찬 주는 옅게 그리고 평균에서 빼요.',
      legend: [
        { kind: 'bar', color: BAR, text: '주별 출고' },
        {
          kind: 'bar',
          color: 'var(--chart-part)',
          text: '재고 없던 날이 있는 주·덜 찬 주',
        },
        { kind: 'dash', color: INK, text: '평균' },
      ],
      note:
        avg != null
          ? {
              tone: 'ink',
              x: box.right - 2,
              y: box.top + 6,
              main: `한 주 평균 ${avg.toLocaleString()}개`,
              small: ['다 판 주만 셌어요'],
              arrow:
                weeks.length > 1
                  ? [tipX + 14, box.top + 40, tipX, y(avg) - 7]
                  : null,
            }
          : null,
    }
  }

  function aheadView(): View {
    const N = 30
    const keep = orderQty > 0 && arrive != null
    const atArrive = Math.max(0, stock - daily * (arrive ?? 0)) + orderQty
    const level = (i: number, order: boolean) =>
      order && arrive != null && i >= arrive
        ? Math.max(0, atArrive - daily * (i - arrive))
        : Math.max(0, stock - daily * i)
    const yes = Array.from({ length: N + 1 }, (_, i) => level(i, keep))
    const no = Array.from({ length: N + 1 }, (_, i) => level(i, false))
    const peak = Math.max(...yes, ...no, 1)
    const step = niceStep(peak * 1.45)
    const top = Math.ceil((peak * 1.45) / step) * step
    const y = (v: number) => box.bottom - (v / top) * (box.bottom - box.top)
    const xs = (i: number) => box.left + (i / N) * (box.right - box.left)
    const zi = no.findIndex((v) => v === 0)
    const zy =
      keep && arrive != null
        ? yes.findIndex((v, i) => i > arrive && v === 0)
        : -1
    const coverEnd =
      keep && arrive != null ? arrive + atArrive / daily : daysLeft
    const line = (arr: number[]) =>
      arr.map((v, i) => `${i ? 'L' : 'M'}${xs(i)},${y(v)}`).join('')
    const endI = keep ? zy : zi
    const arriveFlip = arrive != null && xs(arrive) > box.right - 90

    const g = (
      <>
        {axis(top, step, y)}
        {keep && arrive != null && (
          <>
            <line
              className={`${styles.vline} ${styles.later}`}
              x1={xs(arrive)}
              x2={xs(arrive)}
              y1={box.top - 6}
              y2={box.bottom}
            />
            <text
              className={`${styles.tag} ${styles.later}`}
              style={{ textAnchor: arriveFlip ? 'end' : 'start' }}
              x={xs(arrive) + (arriveFlip ? -6 : 6)}
              y={box.top - 14}
            >
              {dateAfter(arrive)} 도착
            </text>
          </>
        )}
        {keep && (
          <path
            className={`${styles.area} ${styles.areaOk} ${styles.later}`}
            d={`${line(yes)}L${xs(N)},${box.bottom}L${xs(0)},${box.bottom}Z`}
          />
        )}
        <path
          className={`${styles.line} ${styles.noLine} ${keep ? styles.later : styles.draw}`}
          d={line(no)}
          pathLength={keep ? undefined : '1'}
        />
        {keep && (
          <path
            className={`${styles.line} ${styles.planLine} ${styles.draw}`}
            d={line(yes)}
            pathLength="1"
          />
        )}
        {zi >= 0 && (
          <circle
            className={`${styles.dotRed} ${styles.later}`}
            cx={xs(zi)}
            cy={y(0)}
            r="4.5"
          />
        )}
        {keep && zy >= 0 && (
          <circle
            className={`${styles.dotOk} ${styles.later}`}
            cx={xs(zy)}
            cy={y(0)}
            r="5"
          />
        )}
        {endI >= 0 && ripple(xs(endI), y(0), keep ? 'ok' : 'danger')}
        {[0, 5, 10, 15, 20, 25, 30].map((k) => (
          <text
            className={k === 0 ? styles.xNow : styles.xt}
            key={k}
            x={xs(k)}
            y={box.bottom + 20}
          >
            {dateAfter(k)}
          </text>
        ))}
      </>
    )
    const nx = Math.min(box.right - 4, (endI >= 0 ? xs(endI) : box.right) + 40)
    return {
      g,
      count: N + 1,
      xs,
      tip: (i) => ({
        title: dateAfter(i),
        rows: [
          ...(keep
            ? [
                {
                  color: OK,
                  label: `${orderQty.toLocaleString()}개 넣으면`,
                  value: `${Math.round(yes[i]).toLocaleString()}개`,
                },
              ]
            : []),
          {
            color: MUTED,
            label: '안 넣으면',
            value: `${Math.round(no[i]).toLocaleString()}개`,
          },
        ],
      }),
      head: head(
        keep ? (
          <>
            권장 <em className={styles.hlInk}>{orderQty.toLocaleString()}개</em>
            를 지금 넣으면 {dateAfter(coverEnd)}까지 버텨요
          </>
        ) : Number.isFinite(daysLeft) && daysLeft <= N ? (
          <>
            안 넣으면 <em>{outText} 바닥나요</em>
          </>
        ) : (
          <>앞으로 {N}일은 재고가 남아요</>
        ),
      ),
      sub: `${baseDate} 재고 ${stock.toLocaleString()}개에서 하루 ${perDayText(daily)}개씩 줄어드는 계산이에요.${
        arrive != null ? ` 지금 주문하면 ${dateAfter(arrive)}에 도착해요.` : ''
      }`,
      legend: [
        ...(keep
          ? [
              {
                kind: 'line' as const,
                color: OK,
                text: `${orderQty.toLocaleString()}개 넣으면`,
              },
            ]
          : []),
        { kind: 'dash', color: MUTED, text: '안 넣으면' },
        { kind: 'dot', color: BAD, text: '바닥나는 날' },
      ],
      note: keep
        ? {
            tone: 'ok',
            x: nx,
            y: box.top + 6,
            main: `${orderQty.toLocaleString()}개 넣으면`,
            small: [`${dateAfter(coverEnd)}까지`],
            arrow:
              zy >= 0 ? [nx - 12, box.top + 40, xs(zy) + 2, y(0) - 9] : null,
          }
        : null,
    }
  }

  const view =
    active === 'flow'
      ? flowView()
      : active === 'week'
        ? weekView()
        : aheadView()
  const note = view.note
  const hoverTip = hover != null ? view.tip(hover) : null
  const hoverX = hover != null ? view.xs(hover) : 0

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = event.clientX - rect.left
    let best = 0
    for (let i = 1; i < view.count; i += 1) {
      if (Math.abs(view.xs(i) - px) < Math.abs(view.xs(best) - px)) best = i
    }
    setHover(best)
  }
  const onKey = (event: KeyboardEvent, index: number) => {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1
    if (next < 0) return
    event.preventDefault()
    setTab(tabs[next])
    setHover(null)
    tabRefs.current[next]?.focus()
  }

  const svgClass = [styles.tsvg, go && styles.go, done && styles.done]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={styles.trendChart} ref={wrapRef}>
      <div aria-label="차트 고르기" className={styles.tabs} role="tablist">
        {tabs.map((key, index) => (
          <button
            aria-controls="trend-panel"
            aria-selected={key === active}
            className={styles.tab}
            id={`trend-tab-${key}`}
            key={key}
            onClick={() => {
              setTab(key)
              setHover(null)
            }}
            onKeyDown={(event) => onKey(event, index)}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            role="tab"
            tabIndex={key === active ? 0 : -1}
            type="button"
          >
            {tabLabels[key]}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`trend-tab-${active}`}
        id="trend-panel"
        role="tabpanel"
      >
        <p className={styles.trendHead}>{view.head}</p>
        <p className={styles.trendSub}>{view.sub}</p>
        <div className={styles.stage}>
          <svg
            aria-label={`${tabLabels[active]} 그래프`}
            className={svgClass}
            key={active}
            ref={svgRef}
            role="img"
            style={{ height }}
            viewBox={`0 0 ${width} ${height}`}
          >
            <title>{tabLabels[active]}</title>
            {view.g}
            {hover != null && (
              <line
                className={styles.hoverLine}
                x1={hoverX}
                x2={hoverX}
                y1={box.top - 6}
                y2={box.bottom}
              />
            )}
            {!phone && note && (
              <>
                {note.arrow && (
                  <NoteArrow arrow={note.arrow} tone={note.tone} />
                )}
                <text
                  className={styles.note}
                  style={{ fill: toneColor[note.tone] }}
                  x={note.x}
                  y={note.y + 12}
                >
                  {note.main}
                  {note.small.map((line, i) => (
                    <tspan
                      className={styles.noteSmall}
                      dy={i === 0 ? 16 : 14}
                      key={line}
                      x={note.x}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </>
            )}
            <rect
              fill="transparent"
              height={box.bottom - box.top + 10}
              onPointerLeave={() => setHover(null)}
              onPointerMove={onMove}
              width={box.right - box.left}
              x={box.left}
              y={box.top - 10}
            />
          </svg>
          {hoverTip && (
            <div
              className={styles.tip}
              style={{
                left: Math.min(width - 80, Math.max(80, hoverX)),
                top: box.top + 4,
              }}
            >
              <b>{hoverTip.title}</b>
              {hoverTip.rows.map((row) => (
                <span key={row.label}>
                  <i style={{ background: row.color }} />
                  {row.label} <strong>{row.value}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
        {phone && note && (
          <p
            className={`${styles.phoneNote} ${done ? styles.noteOn : ''}`}
            style={{ color: toneColor[note.tone] }}
          >
            {note.main}
            {note.small.length > 0 && <small>{note.small.join(' · ')}</small>}
          </p>
        )}
      </div>
      <div className={styles.trendLegend}>
        {view.legend.map((item) => (
          <span key={item.text}>
            <Swatch color={item.color} kind={item.kind} />
            {item.text}
          </span>
        ))}
      </div>
    </div>
  )
}

// 날짜별 예측(노랑)·실제(남색, 품절 난 때는 빨강) 막대. 숫자는 마우스를 올리면 그날 것만 뜬다.
function AccuracyChart({ items }: { items: AccuracyItem[] }) {
  const box = {
    width: 600,
    height: 150,
    left: 44,
    right: 596,
    top: 8,
    bottom: 118,
  }
  const max = Math.max(
    ...items.map((item) => Math.max(item.outbound, item.predictedOutbound)),
    1,
  )
  const top = Math.ceil(max / 10) * 10
  const y = (value: number) =>
    box.bottom - (value / top) * (box.bottom - box.top)
  const slot = (box.right - box.left) / items.length
  const barWidth = Math.min(15, slot * 0.32)

  return (
    <svg
      aria-label="날짜별 예측과 실제 출고 막대 그래프"
      className={styles.chart}
      role="img"
      viewBox={`0 0 ${box.width} ${box.height}`}
    >
      {[0, top / 2, top].map((tick) => (
        <g key={tick}>
          <line
            className={tick === 0 ? undefined : styles.gridLine}
            x1={box.left - 6}
            x2={box.right}
            y1={y(tick)}
            y2={y(tick)}
          />
          <text className={styles.tick} x={box.left - 10} y={y(tick) + 4}>
            {tick}개
          </text>
        </g>
      ))}
      {items.map((item, index) => {
        const x = box.left + slot * index + slot / 2 - barWidth - 1
        return (
          <g key={`${item.date}-${index}`}>
            <title>
              {`${item.date} 예측 ${item.predictedOutbound}개 · 실제 ${item.outbound}개${item.covered ? '' : ' · 품절'}`}
            </title>
            <rect
              className={styles.predictedBar}
              height={box.bottom - y(item.predictedOutbound)}
              rx={3}
              width={barWidth}
              x={x}
              y={y(item.predictedOutbound)}
            />
            <rect
              className={item.covered ? styles.actualBar : styles.missBar}
              height={box.bottom - y(item.outbound)}
              rx={3}
              width={barWidth}
              x={x + barWidth + 2}
              y={y(item.outbound)}
            />
            <text
              className={item.covered ? styles.xTick : styles.xTickMiss}
              x={x + barWidth + 1}
              y={box.bottom + 18}
            >
              {item.date}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// 권장 입고량이 0에서 올라가며 나타난다(0.7초, ease-out). 움직임 줄이기 설정이나 확인 못 하는 환경에서는 바로 값을 보여 준다.
const canAnimate = () =>
  typeof window.matchMedia === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(() => (canAnimate() ? 0 : value))

  useEffect(() => {
    if (!canAnimate()) return
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min((now - start) / 700, 1)
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <>{(canAnimate() ? shown : value).toLocaleString()}</>
}

export function SkuPage() {
  const { skuId = '' } = useParams()
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['sku', skuId],
    queryFn: () => getSkuDetail(skuId),
  })

  if (query.isPending) {
    return (
      <AsyncState
        description="입고 판단에 필요한 재고와 출고 기록을 모으고 있어요."
        loader={<BoxLoader title="상품" />}
        status="loading"
        title="상품 상세를 불러오고 있어요"
      />
    )
  }

  if (query.isError) {
    // 없는 상품(404)은 다시 해 봐야 소용없으니 대시보드로 보낸다
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <AsyncState
          description="지웠거나 주소가 바뀌었을 수 있어요"
          onRetry={() => navigate('/dashboard')}
          primaryAction
          retryLabel="대시보드로"
          status="error"
          title="이 상품을 찾을 수 없어요"
        />
      )
    }
    return (
      <AsyncState
        description="잠시 뒤에 다시 시도해 주세요. 계속되면 알려 주세요."
        onRetry={() => void query.refetch()}
        status="error"
        title="상품 상세를 불러오지 못했어요"
      />
    )
  }

  const data = query.data
  // 보관 비용(#185): 입고 조건에서 넣은 상자 크기·요율로 권장 수량을 한 달 둘 때
  const storage = loadStorageSettings()
  const storageBox = storage.boxes[skuId]
  const storageCost = monthlyStorageCost(
    storageBox,
    data.recommendation.quantity,
    storage.ratePerCbm,
  )
  // 예상 소진일이 오늘보다 앞이면 "품절 주의"(대시보드 표와 같은 기준). 품절은 확인 못 했으니 단정하지 않는다
  const stockoutPassed =
    data.shortageOn !== null && data.shortageOn < localIsoToday()
  // 판매일 부족이면 "N일이에요 · M일이 되면" 말과 진행 막대로 보여 준다
  const salesMatch = /최근 (\d+)일 중 판매한 날이 (\d+)일로 (\d+)일/.exec(
    data.unavailableReason ?? '',
  )
  const salesDays = salesMatch
    ? {
        window: Number(salesMatch[1]),
        have: Number(salesMatch[2]),
        need: Number(salesMatch[3]),
      }
    : null
  const statusLabel = {
    ready: '계산 완료',
    reference: '참고용',
    unavailable: data.reuploadRequired ? '최신 자료 필요' : '계산 불가',
    pending: '계산 전',
  }[data.status]
  const settingRows = (
    <dl className={styles.evidence}>
      <div>
        <dt>리드타임</dt>
        <dd>
          {setting(data.settings.leadTimeDays, '일')}
          {data.settings.leadTimeDays != null && (
            <span className={styles.source}>
              {sourceLabels[data.settings.leadTimeSource]}
            </span>
          )}
        </dd>
      </div>
      <div>
        <dt>발주 주기</dt>
        <dd>
          {setting(data.settings.reviewCycleDays, '일')}
          {data.settings.reviewCycleDays != null && (
            <span className={styles.source}>
              {sourceLabels[data.settings.reviewCycleSource]}
            </span>
          )}
        </dd>
      </div>
    </dl>
  )
  // 사장님이 넣을 값이 하나라도 비었으면 고치는 곳으로 가는 길을 붙인다
  const settingsMissing =
    data.settings.leadTimeDays == null ||
    data.settings.reviewCycleDays == null ||
    data.settings.orderUnitQty == null
  const settingsLink = settingsMissing && (
    <Link className={styles.fixLink} to="/settings">
      입고 조건에서 정하기 →
    </Link>
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          {/* 출고지는 없으면 줄째 뺀다 */}
          {data.fulfillment && (
            <span className={styles.eyebrow}>{data.fulfillment}</span>
          )}
          <div className={styles.title}>
            <h1>{data.name}</h1>
            {stockoutPassed && <SoldOutStamp />}
          </div>
          <p>바코드 {data.barcode}</p>
        </div>
        {/* 참고용은 아래 안내 하나로 말하니 칩은 뺀다 */}
        {data.status !== 'reference' && (
          <span className={styles.status} data-status={data.status}>
            {statusLabel}
          </span>
        )}
      </header>

      {data.status === 'pending' ? (
        <section className={styles.card}>
          <AsyncState
            description="입고 조건을 확인하고 계산하면 권장 입고량이 나와요."
            onRetry={() => navigate('/settings')}
            retryLabel="입고 조건 확인하기"
            status="empty"
            title="아직 계산 전이에요"
          />
          {settingRows}
          {settingsLink}
        </section>
      ) : data.status === 'unavailable' ? (
        <AsyncState
          description={
            salesDays
              ? `판매한 날이 ${salesDays.have}일이에요 · ${salesDays.need}일이 되면 계산돼요`
              : calculationReason(
                  data.unavailableReason ??
                    '판매 기록이 더 쌓이면 권장 입고량을 계산할 수 있어요.',
                )
          }
          status="empty"
          title={
            data.reuploadRequired
              ? '최신 수불부가 필요해요'
              : '아직 계산할 데이터가 부족해요'
          }
          onRetry={
            data.reuploadRequired ? () => navigate('/upload') : undefined
          }
          retryLabel="수불부 다시 올리기"
        >
          {salesDays && (
            <div className={styles.salesProgress}>
              <progress
                aria-label={`판매한 날 ${salesDays.have}일 / ${salesDays.need}일`}
                max={salesDays.need}
                value={salesDays.have}
              />
              <small>
                최근 {salesDays.window}일 기준 ·{' '}
                {salesDays.need - salesDays.have}일 더 팔리면 다음 계산에
                들어가요
              </small>
            </div>
          )}
          {data.unavailableReason && (
            <ReasonDetail reason={data.unavailableReason} />
          )}
        </AsyncState>
      ) : (
        <>
          {data.status === 'reference' ? (
            <aside className={styles.refNotice}>
              <strong>
                {stockoutPassed && data.shortageOn
                  ? `${monthDay(data.shortageOn)}에 바닥났을 수 있어요 · 참고용 계산이에요`
                  : '참고용 계산이에요'}
              </strong>
              <span>
                판매 기록이 짧아 예측 범위가 넓어요. 권장{' '}
                {data.recommendation.quantity.toLocaleString()}개는 넉넉히 잡은
                값이라, 최근 판매를 보고 넣어 주세요.
              </span>
            </aside>
          ) : (
            stockoutPassed &&
            data.shortageOn && (
              <aside className={styles.soldBanner}>
                {monthDay(data.shortageOn)}에 재고가 바닥났을 수 있어요 · 권장{' '}
                {data.recommendation.quantity.toLocaleString()}개를 지금 넣어
                주세요
              </aside>
            )
          )}
          <section className={styles.recommendation}>
            <div>
              <span>권장 입고량</span>
              {/* 가장 중요한 숫자라 테이프를 밑줄처럼 붙인다 */}
              <strong
                aria-label={`권장 입고량 ${data.recommendation.quantity.toLocaleString()}개`}
                className={styles.recoQty}
              >
                <Tape className={styles.recoTape} />
                <span aria-hidden="true" className={styles.recoNum}>
                  <CountUp value={data.recommendation.quantity} />
                  <small className={styles.recoUnit}>개</small>
                </span>
              </strong>
            </div>
            <dl>
              <div>
                <dt>예상 사입비</dt>
                <dd>
                  {data.recommendation.cost == null ? (
                    <Link className={styles.fixLink} to="/settings">
                      단가를 넣으면 보여요 →
                    </Link>
                  ) : (
                    `${data.recommendation.cost.toLocaleString()}원`
                  )}
                </dd>
              </div>
              <div>
                <dt>한 달 보관비</dt>
                <dd>
                  {storageCost == null ? (
                    <Link className={styles.fixLink} to={STORAGE_LINK}>
                      상자 크기를 넣으면 보여요 →
                    </Link>
                  ) : (
                    <>
                      {`${storageCost.toLocaleString()}원`}
                      <small className={styles.costWork}>
                        {storageBox &&
                          `${formatCbm(cbmOf(storageBox))} CBM × ${data.recommendation.quantity.toLocaleString()}개 × ${storage.ratePerCbm?.toLocaleString()}원`}
                      </small>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>현재 예상 소진일</dt>
                <dd>
                  {data.recommendation.expectedStockoutDate ?? (
                    <EmptyValue kind="short" />
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <div className={styles.mainGrid}>
            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <h2>재고·출고 추이</h2>
              </div>
              {data.history.length > 0 ? (
                <TrendChart
                  coverDays={data.calculation.coverDays}
                  forecastQty={data.calculation.forecastQty}
                  history={data.history}
                  leadDays={data.settings.leadTimeDays}
                  orderQty={data.recommendation.quantity}
                  shortageOn={data.shortageOn}
                  startStock={data.calculation.startingInventory}
                />
              ) : (
                <AsyncState
                  description="수불부를 올리면 바로 채워져요"
                  onRetry={() => navigate('/upload')}
                  retryLabel="수불부 올리기"
                  status="empty"
                  title="판매 기록이 쌓이면 여기에 그래프가 보여요"
                />
              )}
            </section>

            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <h2>계산 근거</h2>
              </div>
              {data.method && (
                <p className={styles.methodSentence}>
                  {methodSentence(data.method)}
                  {!data.method.fallback && (
                    <small>기본 계산 방식을 적용했어요</small>
                  )}
                </p>
              )}
              <ol className={styles.steps}>
                <li>
                  <span aria-hidden="true" className={styles.stepOp} />
                  <span>앞으로 {data.calculation.coverDays}일 예상 출고</span>
                  <strong>{count(data.calculation.forecastQty)}</strong>
                </li>
                <li>
                  <span aria-hidden="true" className={styles.stepOp}>
                    ×
                  </span>
                  <span>여유 배수</span>
                  <strong>{data.calculation.multiplier}배</strong>
                </li>
                <li>
                  <span aria-hidden="true" className={styles.stepOp}>
                    −
                  </span>
                  <span>
                    시작 재고
                    {data.calculation.startingInventoryEstimated && (
                      <small> 추정</small>
                    )}
                  </span>
                  <strong>
                    {data.calculation.startingInventory == null ? (
                      <EmptyValue kind="short" />
                    ) : (
                      count(data.calculation.startingInventory)
                    )}
                  </strong>
                </li>
                {Boolean(data.calculation.existingOrders) && (
                  <li>
                    <span aria-hidden="true" className={styles.stepOp}>
                      −
                    </span>
                    <span>기존 발주</span>
                    <strong>{count(data.calculation.existingOrders)}</strong>
                  </li>
                )}
                {/* 셀러가 꼭 봐야 하는 줄: 입고가 오기 전에 이미 놓치는 주문. 노란 느낌표로 강조 */}
                {Boolean(data.calculation.preArrivalUnmet) && (
                  <li className={styles.stepWarn}>
                    <span aria-hidden="true" className={styles.stepOp}>
                      −
                    </span>
                    <span>
                      <b className={styles.warnLabel}>
                        <span aria-hidden="true" className={styles.warnMark}>
                          !
                        </span>
                        도착 전에 못 파는 양
                      </b>
                      <small>입고가 오기 전에 이미 놓친 주문이라 빼요</small>
                    </span>
                    <strong>{count(data.calculation.preArrivalUnmet)}</strong>
                  </li>
                )}
                {data.calculation.rawQuantity != null && (
                  <li className={styles.stepSum}>
                    <span aria-hidden="true" className={styles.stepOp}>
                      =
                    </span>
                    <span>필요한 양</span>
                    <strong>
                      {data.calculation.rawQuantity.toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                      개
                    </strong>
                  </li>
                )}
                <li className={styles.stepFinal}>
                  <span aria-hidden="true" className={styles.stepOp}>
                    ↑
                  </span>
                  <span>
                    {data.calculation.inboundUnit == null
                      ? '입고 단위로 올림'
                      : `입고 단위 ${data.calculation.inboundUnit}개로 올림`}
                    <small>
                      권장 입고량
                      {data.calculation.inboundUnit == null && (
                        <>
                          {' '}
                          · 입고 단위 <EmptyValue kind="unset" />
                        </>
                      )}
                    </small>
                  </span>
                  <strong>{count(data.recommendation.quantity)}</strong>
                </li>
              </ol>
              <p className={styles.leadTime}>
                리드타임 {setting(data.settings.leadTimeDays, '일')}
                {data.settings.leadTimeDays != null && (
                  <span className={styles.source}>
                    {sourceLabels[data.settings.leadTimeSource]}
                  </span>
                )}
              </p>
              {settingsLink}
            </section>
          </div>

          {data.resultId !== null && (
            <ScenarioInsight
              baseDate={data.baseDate}
              inboundUnit={data.calculation.inboundUnit ?? 1}
              key={data.resultId}
              productId={skuId}
              resultId={data.resultId}
            />
          )}

          {data.accuracy && <AccuracyCard accuracy={data.accuracy} />}
        </>
      )}
    </div>
  )
}

// 지난 예측 맞춰 보기(부록): 품절 피함(원) · 보통 빗나감(범위 막대) · 품절로 못 판 개수(날짜별 칸) + 날짜별 막대
const DONUT_R = 21
const DONUT_C = 2 * Math.PI * DONUT_R

function AccuracyCard({
  accuracy,
}: {
  accuracy: NonNullable<SkuDetail['accuracy']>
}) {
  const stats = accuracyStats(accuracy.history)

  if (stats.total < MIN_ACCURACY_ITEMS) {
    return (
      <section className={styles.card}>
        <div className={styles.accuracyHeader}>
          <h2>지난 예측 맞춰 보기</h2>
        </div>
        <p className={styles.accuracyEmpty}>지난 예측이 쌓이면 보여요</p>
      </section>
    )
  }

  const seg = DONUT_C / stats.total
  // 범위 막대: 예측 ± N을 0~high 눈금 위에 놓는다(그림 폭 70)
  const scale = 70 / Math.max(stats.high * 1.1, 1)
  const bandX = 4 + stats.low * scale
  const bandW = Math.max((stats.high - stats.low) * scale, 2)
  const centerX = 4 + stats.avgPredicted * scale
  const worst = stats.worst

  return (
    <section className={styles.card}>
      <div className={styles.accuracyHeader}>
        <h2>지난 예측 맞춰 보기</h2>
        <p>지난 {stats.total}번 · 이 상품</p>
      </div>
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <svg
            aria-label={`${stats.total}번 중 ${stats.coveredCount}번 품절 피함`}
            height="56"
            role="img"
            viewBox="0 0 56 56"
            width="56"
          >
            {stats.items.map((item, index) => (
              <circle
                cx="28"
                cy="28"
                fill="none"
                key={index}
                r={DONUT_R}
                stroke={item.covered ? '#1f2537' : '#c8261c'}
                strokeDasharray={`${Math.max(seg - 2.2, 0.1)} ${DONUT_C}`}
                strokeDashoffset={-seg * index}
                strokeWidth="8"
                transform="rotate(-90 28 28)"
              />
            ))}
            <text
              fill="#141922"
              fontSize="12.5"
              fontWeight="800"
              textAnchor="middle"
              x="28"
              y="32"
            >
              {stats.coveredCount}/{stats.total}
            </text>
          </svg>
          <span className={styles.kpiLabel}>품절 피함</span>
          <strong className={styles.kpiValue}>
            {stats.total}번 중 {stats.coveredCount}번
          </strong>
          <span className={styles.kpiNote}>
            권장대로 넣었으면 품절이 없었어요
          </span>
        </div>
        <div className={styles.kpi}>
          <svg
            aria-label={`예측 ${stats.avgPredicted}개, 보통 ±${stats.miss}개`}
            height="56"
            role="img"
            viewBox="0 0 78 56"
            width="78"
          >
            <text
              fill="#141922"
              fontSize="10"
              fontWeight="800"
              textAnchor="middle"
              x="39"
              y="11"
            >
              예측 {stats.avgPredicted}개
            </text>
            <rect fill="#efe8dc" height="12" rx="6" width="70" x="4" y="22" />
            <rect
              fill="#ffc53d"
              height="12"
              opacity=".55"
              width={bandW}
              x={bandX}
              y="22"
            />
            <line
              stroke="#1f2537"
              strokeWidth="2"
              x1={centerX}
              x2={centerX}
              y1="15"
              y2="41"
            />
            <text
              fill="#5c6370"
              fontSize="10"
              textAnchor="middle"
              x={bandX}
              y="52"
            >
              {stats.low}
            </text>
            <text
              fill="#5c6370"
              fontSize="10"
              textAnchor="middle"
              x={bandX + bandW}
              y="52"
            >
              {stats.high}
            </text>
          </svg>
          <span className={styles.kpiLabel}>보통 빗나감</span>
          <strong className={styles.kpiValue}>±{stats.miss}개</strong>
          <span className={styles.kpiNote}>
            한 번에 출고 {stats.avgPredicted}개쯤에서 이만큼 오르내려요
          </span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>품절로 못 판 개수</span>
          <strong className={styles.kpiValue}>
            {stats.lostTimes}번 동안 {stats.lostTotal}개
          </strong>
          <span
            aria-label={`날짜별 못 판 개수 ${stats.lost.join(', ')}`}
            className={styles.lostRow}
            role="img"
          >
            {stats.lost.map((value, index) => (
              <i data-lost={value > 0} key={index}>
                {value}
              </i>
            ))}
          </span>
          <span className={styles.kpiNote}>
            재고가 0이라 못 판 개수(예측보다 넘친 만큼)
          </span>
        </div>
      </div>
      <div className={styles.chartHead}>
        <b>날짜별 예측과 실제 출고</b>
        <div className={styles.legend} role="group" aria-label="그래프 범례">
          <span data-series="predictedBar">예측</span>
          <span data-series="actualBar">실제</span>
          <span data-series="missBar">실제 · 품절 난 때</span>
        </div>
      </div>
      <AccuracyChart items={stats.items} />
      <p className={styles.accuracyNote}>
        {worst
          ? `${worst.item.date}만 실제가 예측보다 크게 많았어요(+${worst.over}개)${worst.item.covered ? '' : ' — 이때 품절'}`
          : '실제가 예측보다 크게 많았던 때는 없어요'}
      </p>
    </section>
  )
}

function localIsoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
