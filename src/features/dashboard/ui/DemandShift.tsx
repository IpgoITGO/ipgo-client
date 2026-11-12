import { useQueries } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'

import { Modal } from '../../../shared/ui/Modal/Modal'
import { getSkuDetail, type SkuDetail } from '../../sku/model/skuApi'

type History = SkuDetail['history']
import { type DemandShift, useDemandShift } from '../model/dashboardApi'
import { type Week, weeklyFromHistory } from '../model/weekly'
import styles from './DemandShift.module.css'

// 판매 급변 알림(11/12). 판단은 서버 demandShift(#193), 그래프는 상품 상세의 하루 출고(90일)를 주별로 묶어 그린다.
// 그림 대신 실제 판매: "지난 주들·작년 같은 주엔 이랬는데 이번 주엔 이만큼"

const monthDay = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}`
}

// 같은 수불부(급변 시작일)에서는 한 번만 띄운다. 브라우저에 기억(막혀 있어도 화면은 돈다)
const SEEN_KEY = 'ipgo:shift-seen'
function seen(key: string) {
  try {
    return (
      JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]
    ).includes(key)
  } catch {
    return false
  }
}
function markSeen(key: string) {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]
    localStorage.setItem(SEEN_KEY, JSON.stringify([...list, key].slice(-200)))
  } catch {
    /* 기억 못 해도 닫기는 된다 */
  }
}

// 주별 막대. 이번 주만 노랑, 점선 = 작년 같은 주. mini는 목록용 작은 막대(눈금·점선 없음)
export function ShiftChart({
  weeks,
  name,
  mini = false,
}: {
  weeks: Week[]
  name: string
  mini?: boolean
}) {
  const w = mini ? 150 : 480
  const h = mini ? 40 : 170
  const max =
    Math.max(
      ...weeks.map((week) => Math.max(week.avg, week.lastYear ?? 0)),
      1,
    ) * 1.08
  const pad = mini ? 2 : 26
  const bw = (w - pad) / Math.max(weeks.length, 1)
  const y = (value: number) => h - 18 - (value / max) * (h - 30)
  const line = weeks
    .map((week, i) =>
      week.lastYear == null
        ? ''
        : `${pad + i * bw + bw / 2} ${y(week.lastYear)}`,
    )
    .filter(Boolean)
  return (
    <svg
      aria-label={`${name} 주별 하루 평균 판매`}
      className={styles.chart}
      role="img"
      viewBox={`0 0 ${w} ${h}`}
    >
      {!mini &&
        [0, Math.round(max / 2), Math.floor(max)].map((tick) => (
          <g key={tick}>
            <line
              className={styles.grid}
              x1={pad}
              x2={w}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className={styles.tick}
              textAnchor="end"
              x={pad - 6}
              y={y(tick) + 4}
            >
              {tick}
            </text>
          </g>
        ))}
      {weeks.map((week, i) => {
        const bh = Math.max(mini ? 4 : 2, h - 18 - y(week.avg))
        return (
          <rect
            className={i === weeks.length - 1 ? styles.now : styles.bar}
            height={bh}
            key={week.end}
            rx={2}
            width={bw * 0.64}
            x={pad + i * bw + bw * 0.18}
            y={h - 18 - bh}
          />
        )
      })}
      {!mini && line.length > 1 && (
        <path className={styles.lastYear} d={`M${line.join(' L')}`} />
      )}
      {!mini && weeks.length > 0 && (
        <>
          <text className={styles.tick} x={pad} y={h - 2}>
            {monthDay(weeks[0].end)} 주
          </text>
          <text className={styles.tick} textAnchor="end" x={w} y={h - 2}>
            {monthDay(weeks[weeks.length - 1].end)} 주
          </text>
        </>
      )}
    </svg>
  )
}

// 시나리오 판매 급변 카드 안 그래프(11/12): 막대 + 기준 점선만 그리고, 글자는 그래프 밖 설명 줄에(카드 폭이 좁아도 안 겹치고 안 작아지게)
export function SurgeCardChart({
  weeks,
  refValue,
  refLabel,
  nowLabel,
  name,
}: {
  weeks: Week[]
  /** 점선 높이: 늘 때는 평소 하루, 줄 때는 급증 때 하루 */
  refValue: number
  refLabel: string
  nowLabel: string
  name: string
}) {
  const w = 200
  const h = 84
  const max = Math.max(...weeks.map((week) => week.avg), refValue, 1) * 1.05
  const bw = w / Math.max(weeks.length, 1)
  const y = (value: number) => h - (value / max) * (h - 4)
  return (
    <div className={styles.cardChart}>
      <svg
        aria-label={`${name} 최근 ${weeks.length}주 하루 평균 판매. ${refLabel}, ${nowLabel}`}
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${w} ${h}`}
      >
        {weeks.map((week, i) => {
          const bh = Math.max(2, h - y(week.avg))
          return (
            <rect
              className={i === weeks.length - 1 ? styles.now : styles.bar}
              height={bh}
              key={week.end}
              rx={2}
              width={bw * 0.64}
              x={i * bw + bw * 0.18}
              y={h - bh}
            />
          )
        })}
        <line
          className={styles.base}
          vectorEffect="non-scaling-stroke"
          x1={0}
          x2={w}
          y1={y(refValue)}
          y2={y(refValue)}
        />
      </svg>
      <p className={styles.cardLegend}>
        <span>
          <i className={styles.keyRef} />
          {refLabel}
        </span>
        <span>
          <i className={styles.keyNow} />
          {nowLabel}
        </span>
      </p>
    </div>
  )
}

function shiftTitle(name: string, shift: DemandShift) {
  return shift.direction === 'UP'
    ? `${name}이 평소보다 ${Math.round(shift.ratio)}배 팔렸어요`
    : `${name} 판매가 평소로 돌아왔어요`
}

// 상품 상세: 이 상품이 판매 급변이면 한 번 띄운다
export function ShiftPopup({
  productId,
  name,
  history,
  onAdjust,
  reopen,
  onClosed,
}: {
  productId: string
  name: string
  history: History
  onAdjust: () => void
  /** 시나리오 카드의 "이유 보기"를 누르면 true */
  reopen: boolean
  onClosed: () => void
}) {
  const titleId = useId()
  const shift = useDemandShift(productId)
  const key = shift ? `${productId}:${shift.since}:${shift.direction}` : ''
  // 처음엔 한 번 저절로 열고, 닫은 뒤에는 시나리오 카드의 "이유 보기"로 다시 연다(11/12)
  const [closedKey, setClosedKey] = useState<string | null>(null)
  if (!shift) return null
  const open = reopen || (closedKey !== key && !seen(key))
  const weeks = weeklyFromHistory(history)
  const close = () => {
    markSeen(key)
    setClosedKey(key)
    onClosed()
  }
  const up = shift.direction === 'UP'
  return (
    <>
      {open && (
        <Modal labelledBy={titleId} onClose={close}>
          <div className={styles.body}>
            <span className={styles.kicker} data-dir={shift.direction}>
              ● {up ? '판매가 갑자기 늘었어요' : '판매가 평소로 돌아왔어요'}
            </span>
            <h2 className={styles.title} id={titleId}>
              {shiftTitle(name, shift)}
            </h2>
            {weeks.length >= 4 && (
              <p className={styles.sub}>
                하루 평균 판매 · 최근 {weeks.length}주
              </p>
            )}
            <div className={styles.legend}>
              <span>
                <i className={styles.swBar} />
                지난 주들
              </span>
              <span>
                <i className={styles.swNow} />
                이번 주
              </span>
              <span>
                <i className={styles.swLy} />
                작년 같은 주
              </span>
            </div>
            {/* 기록이 4주보다 짧으면 막대 하나짜리 그래프가 돼서 그리지 않고 숫자만(11/12) */}
            {weeks.length >= 4 && <ShiftChart name={name} weeks={weeks} />}
            <div className={styles.cmp}>
              <div>
                <span>지난 4주 하루</span>
                <b>
                  {shift.baselineDailyQty}
                  <small>개</small>
                </b>
              </div>
              <div>
                <span>작년 같은 주 하루</span>
                <b>
                  {weeks.at(-1)?.lastYear ?? '—'}
                  <small>개</small>
                </b>
              </div>
              <div data-now="">
                <span>이번 주 하루</span>
                <b>
                  {shift.recentDailyQty}
                  <small>개</small>
                </b>
              </div>
            </div>
            <p className={styles.note}>
              {up
                ? '권장 입고량은 아직 평소 속도로 계산됐을 수 있어요. 행사·대량 주문처럼 이번만 그런 건지 확인해 주세요.'
                : '급증이 끝나 권장 입고량이 크게 줄 수 있어요. 계산이 틀린 게 아니에요.'}
            </p>
            <div className={styles.actions}>
              {up ? (
                <>
                  <button
                    className={styles.primary}
                    onClick={() => {
                      close()
                      onAdjust()
                    }}
                    type="button"
                  >
                    계속 이렇게 팔릴 것 같아요 · 수량 다시 정하기
                  </button>
                  <button
                    className={styles.secondary}
                    onClick={close}
                    type="button"
                  >
                    이번만 특별했어요
                  </button>
                </>
              ) : (
                <button
                  className={styles.secondary}
                  onClick={close}
                  type="button"
                >
                  확인했어요
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// 대시보드: 판매 급변 상품이 있으면 이 계산(runId)에서 한 번 모아서 띄운다. 상품마다 작은 막대
export function ShiftSummary({
  runId,
  items,
}: {
  runId: number | null | undefined
  items: Array<{ id: string; name: string; shift?: DemandShift | null }>
}) {
  const titleId = useId()
  const shifted = items.filter(
    (item): item is typeof item & { shift: DemandShift } => Boolean(item.shift),
  )
  const key = `run:${runId ?? 'none'}`
  const [closed, setClosed] = useState(false)
  const open = shifted.length > 0 && !closed && !seen(key)
  const details = useQueries({
    queries: (open ? shifted : []).map((item) => ({
      queryKey: ['sku', item.id],
      queryFn: () => getSkuDetail(item.id),
    })),
  })
  if (!open) return null
  const close = () => {
    markSeen(key)
    setClosed(true)
  }
  return (
    <Modal labelledBy={titleId} onClose={close}>
      <div className={styles.body}>
        <h2 className={styles.title} id={titleId}>
          판매가 갑자기 바뀐 상품이 {shifted.length}개 있어요
        </h2>
        <p className={styles.sub}>
          이번 수불부 기준 · 권장량에 아직 덜 반영됐을 수 있어요
        </p>
        <ul className={styles.list}>
          {shifted.map((item, i) => {
            const history = details[i]?.data?.history
            return (
              <li key={item.id}>
                <span>
                  <b>{item.name}</b>
                  <small>
                    {item.shift.direction === 'UP'
                      ? `하루 ${item.shift.baselineDailyQty}개 → ${item.shift.recentDailyQty}개 (${Math.round(item.shift.ratio)}배)`
                      : `다시 줄었어요 · 하루 ${item.shift.recentDailyQty}개`}
                  </small>
                </span>
                <span className={styles.mini}>
                  {history && weeklyFromHistory(history).length >= 4 && (
                    <ShiftChart
                      mini
                      name={item.name}
                      weeks={weeklyFromHistory(history)}
                    />
                  )}
                </span>
                <Link onClick={close} to={`/sku/${item.id}`}>
                  보기 →
                </Link>
              </li>
            )
          })}
        </ul>
        <div className={styles.actions}>
          <button className={styles.secondary} onClick={close} type="button">
            확인했어요
          </button>
        </div>
      </div>
    </Modal>
  )
}
