import { useRef, useState } from 'react'

import { pad, roundTo10 } from './hourLabel'
import styles from './TimeField.module.css'

// 받을 시각(11/14): 둥근 시·분 칸, 10분 단위. 눌러서 고르거나 직접 적고, 칸을 벗어나거나 Enter면 저장.
// 서버는 아직 '시'만 받아서(sendHour) 분은 화면에만 두고 정시로 보낸다.
export function TimeField({
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
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(`${pad(value)}:00`)
  const [saved, setSaved] = useState(value)
  if (saved !== value) {
    setSaved(value)
    setText(`${pad(value)}:00`)
  }
  const [hour, minute] = text.split(':').map(Number)
  const commit = () => {
    const rounded = roundTo10(text)
    if (rounded !== text) setText(rounded)
    const nextHour = Number(rounded.split(':')[0])
    if (Number.isInteger(nextHour) && nextHour !== value) onChange(nextHour)
  }
  return (
    <span className={styles.box}>
      {/* 칸 어디를 눌러도 시계 고르기가 열린다(지원하는 브라우저) */}
      <span
        className={styles.field}
        data-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) inputRef.current?.showPicker?.()
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
        <input
          aria-label={label}
          className={styles.input}
          disabled={disabled}
          onBlur={commit}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
          }}
          ref={inputRef}
          step={600}
          type="time"
          value={text}
        />
      </span>
      {minute > 0 && (
        <small className={styles.note}>
          지금은 {hour}시 정각에 보내요 · 분은 준비 중
        </small>
      )}
    </span>
  )
}
