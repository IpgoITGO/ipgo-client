import { useEffect, useMemo, useRef, useState } from 'react'

import type { Scenario } from '../model/resultApi'
import styles from './StockFlowChart.module.css'

const W = 520
const H = 210
const LEFT = 44
const RIGHT = 14
const TOP = 16
const BOTTOM = 34
const STEPS = 17
const TWEEN_MS = 380

const canAnimate = () =>
  typeof window.matchMedia === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 하루 출고가 일정하다고 보고 그린 대략의 흐름이다.
// 서버가 주는 값(수량 · 다음 입고 때 남는 재고 · 모자란 수요)에서
// "입고 직후부터 다음 입고 때까지 줄어드는 양"을 거꾸로 구해 직선으로 잇는다.
function curve(scenario: Scenario) {
  const used =
    scenario.quantity -
    (scenario.remainingAtNextInbound - scenario.unmetDemandQty)
  const total = used > 0 ? used : Math.max(scenario.quantity, 1)
  return (progress: number) => Math.max(0, scenario.quantity - total * progress)
}

function valuesOf(scenario: Scenario) {
  const at = curve(scenario)
  return Array.from({ length: STEPS }, (_, index) => at(index / (STEPS - 1)))
}

const sameValues = (a: number[], b: number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index])

export function StockFlowChart({
  horizonDays,
  scenarios,
  selectedId,
}: {
  horizonDays: number
  scenarios: Scenario[]
  selectedId: string
}) {
  const selected = scenarios.find((item) => item.id === selectedId)
  const yMax = Math.max(...scenarios.map((item) => item.quantity), 1)

  // 화면이 다시 그려질 때마다 새 배열이 만들어지지 않게, 값이 같으면 같은 배열을 쓴다.
  const key = selected
    ? `${selected.id}:${selected.quantity}:${selected.remainingAtNextInbound}:${selected.unmetDemandQty}`
    : ''
  const target = useMemo(
    () => (selected ? valuesOf(selected) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key가 selected의 값을 모두 담는다
    [key],
  )

  // 고르면 그래프가 이전 모양에서 새 모양으로 ease-out으로 옮겨 간다.
  const shownRef = useRef(target)
  const [tween, setTween] = useState<number[] | null>(null)
  useEffect(() => {
    const from = shownRef.current
    if (
      !canAnimate() ||
      sameValues(from, target) ||
      from.length !== target.length
    ) {
      shownRef.current = target
      return
    }
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min((now - start) / TWEEN_MS, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = from.map(
        (value, index) => value + (target[index] - value) * eased,
      )
      shownRef.current = current
      setTween(progress < 1 ? current : null)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target])

  if (!selected) return null
  const shown = tween ?? target

  const x = (index: number) => LEFT + (index * (W - LEFT - RIGHT)) / (STEPS - 1)
  const y = (value: number) => TOP + (H - TOP - BOTTOM) * (1 - value / yMax)
  const points = (values: number[]) =>
    values
      .map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`)
      .join(' ')

  const depletes =
    selected.unmetDemandQty > 0 || selected.remainingAtNextInbound <= 0
  const used =
    selected.quantity -
    (selected.remainingAtNextInbound - selected.unmetDemandQty)
  const total = used > 0 ? used : Math.max(selected.quantity, 1)
  const depletionIndex = Math.min(
    (selected.quantity / total) * (STEPS - 1),
    STEPS - 1,
  )
  const endLabel = depletes
    ? selected.expectedStockoutDate === '—'
      ? '재고가 바닥나요'
      : `${selected.expectedStockoutDate} 바닥`
    : `끝에 ${selected.remainingAtNextInbound.toLocaleString()}개`

  return (
    <figure className={styles.figure}>
      <figcaption>
        <strong>{selected.quantity.toLocaleString()}개</strong>를 넣으면 재고가
        이렇게 줄어요
      </figcaption>
      <svg
        aria-label={`${selected.quantity.toLocaleString()}개를 넣었을 때 입고 직후부터 ${horizonDays}일 동안 남는 재고. ${endLabel}`}
        className={styles.chart}
        role="img"
        viewBox={`0 0 ${W} ${H}`}
      >
        {[0, yMax].map((value) => (
          <g key={value}>
            <line
              className={styles.grid}
              x1={LEFT}
              x2={W - RIGHT}
              y1={y(value)}
              y2={y(value)}
            />
            <text
              className={styles.tick}
              textAnchor="end"
              x={LEFT - 8}
              y={y(value) + 4}
            >
              {Math.round(value).toLocaleString()}
            </text>
          </g>
        ))}
        {scenarios
          .filter((item) => item.id !== selected.id)
          .map((item) => (
            <polyline
              className={styles.ghost}
              key={item.id}
              points={points(valuesOf(item))}
            />
          ))}
        <polyline className={styles.line} points={points(shown)} />
        {depletes ? (
          <>
            <circle
              className={styles.danger}
              cx={x(depletionIndex)}
              cy={y(0)}
              r="5"
            />
            <text
              className={styles.dangerLabel}
              textAnchor="middle"
              x={x(depletionIndex)}
              y={y(0) - 12}
            >
              {endLabel}
            </text>
          </>
        ) : (
          <>
            <circle
              className={styles.ok}
              cx={x(STEPS - 1)}
              cy={y(shown[STEPS - 1])}
              r="5"
            />
            <text
              className={styles.okLabel}
              textAnchor="end"
              x={x(STEPS - 1) - 8}
              y={y(shown[STEPS - 1]) - 12}
            >
              {endLabel}
            </text>
          </>
        )}
        <text className={styles.tick} x={LEFT} y={H - 10}>
          입고 직후
        </text>
        <text className={styles.tick} textAnchor="end" x={W - RIGHT} y={H - 10}>
          {horizonDays}일 뒤
        </text>
      </svg>
      <p>
        하루 출고가 일정하다고 보고 그린 대략의 모양이에요. 흐린 선은 다른
        수량이에요.
      </p>
    </figure>
  )
}
