import { useState } from 'react'

import styles from './DatePicker.module.css'

type DatePickerProps = {
  /** YYYY-MM-DD. 비어 있으면 ''. */
  value: string
  onChange: (value: string) => void
  /** 빨간 점으로 짚어 줄 날짜 (예: 지나 버린 원래 도착일) */
  markedDate?: string
  markedLabel?: string
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function toKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function todayKey() {
  const now = new Date()
  return toKey(now.getFullYear(), now.getMonth(), now.getDate())
}

// 브라우저 기본 날짜 칸 대신 쓰는 한 달 달력. 오늘은 테두리, 고른 날은 남색, 짚을 날은 빨간 점.
export function DatePicker({
  value,
  onChange,
  markedDate,
  markedLabel,
}: DatePickerProps) {
  const start = (value || todayKey()).split('-').map(Number)
  const [view, setView] = useState({ year: start[0], month: start[1] - 1 })
  const today = todayKey()

  const firstWeekday = new Date(view.year, view.month, 1).getDay()
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]

  function move(step: number) {
    const date = new Date(view.year, view.month + step, 1)
    setView({ year: date.getFullYear(), month: date.getMonth() })
  }

  return (
    <div className={styles.picker}>
      <div className={styles.head}>
        <button aria-label="이전 달" onClick={() => move(-1)} type="button">
          ‹
        </button>
        <strong aria-live="polite">
          {view.year}년 {view.month + 1}월
        </strong>
        <button aria-label="다음 달" onClick={() => move(1)} type="button">
          ›
        </button>
      </div>
      <div className={styles.grid}>
        {WEEKDAYS.map((day) => (
          <span className={styles.weekday} key={day}>
            {day}
          </span>
        ))}
        {cells.map((day, index) => {
          if (day === null) return <span key={`blank-${index}`} />
          const key = toKey(view.year, view.month, day)
          const marked = key === markedDate
          return (
            <button
              aria-label={`${view.month + 1}월 ${day}일${marked && markedLabel ? ` (${markedLabel})` : ''}`}
              aria-pressed={key === value}
              className={styles.day}
              data-marked={marked || undefined}
              data-today={key === today || undefined}
              key={key}
              onClick={() => onChange(key)}
              type="button"
            >
              {day}
            </button>
          )
        })}
      </div>
      <div className={styles.foot}>
        <span>
          {value
            ? `고른 날: ${Number(value.slice(5, 7))}월 ${Number(value.slice(8))}일`
            : '날짜를 고르지 않았어요'}
        </span>
        {value && (
          <button onClick={() => onChange('')} type="button">
            비우기
          </button>
        )}
      </div>
    </div>
  )
}
