import { useState } from 'react'

import { hourLabel } from './hourLabel'
import styles from './HourSlider.module.css'

// 받을 시각(11/13): 0~23시를 순서대로 끄는 작은 막대. 손을 떼면 저장한다
export function HourSlider({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled?: boolean
  label: string
  onChange: (hour: number) => void
  value: number
}) {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(value)
  // 서버 값이 바뀌면 막대도 그 값으로(렌더 중 비교)
  if (saved !== value) {
    setSaved(value)
    setDraft(value)
  }
  const commit = () => {
    if (draft !== value) onChange(draft)
  }
  return (
    <div className={styles.box}>
      <output className={styles.value}>{hourLabel(draft)}</output>
      <div className={styles.track}>
        <input
          aria-label={label}
          aria-valuetext={hourLabel(draft)}
          disabled={disabled}
          max={23}
          min={0}
          onBlur={commit}
          onChange={(event) => setDraft(Number(event.target.value))}
          onKeyUp={commit}
          onPointerUp={commit}
          step={1}
          style={{ '--fill': `${(draft / 23) * 100}%` } as React.CSSProperties}
          type="range"
          value={draft}
        />
        <span aria-hidden="true" className={styles.ticks}>
          <i>오전 12</i>
          <i>6</i>
          <i>낮 12</i>
          <i>6</i>
          <i>11시</i>
        </span>
      </div>
    </div>
  )
}
