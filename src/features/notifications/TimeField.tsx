import { useState } from 'react'

import styles from './TimeField.module.css'

const pad = (n: number) => String(n).padStart(2, '0')

// 받을 시각(11/14): 평범한 시·분 칸. 눌러서 고르거나 직접 적고, 칸을 벗어나면 저장한다.
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
  const [text, setText] = useState(`${pad(value)}:00`)
  const [saved, setSaved] = useState(value)
  if (saved !== value) {
    setSaved(value)
    setText(`${pad(value)}:00`)
  }
  const [hour, minute] = text.split(':').map(Number)
  const commit = () => {
    if (Number.isInteger(hour) && hour !== value) onChange(hour)
  }
  return (
    <span className={styles.box}>
      <input
        aria-label={label}
        className={styles.input}
        disabled={disabled}
        onBlur={commit}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
        step={60}
        type="time"
        value={text}
      />
      {minute > 0 && (
        <small className={styles.note}>
          지금은 {hour}시 정각에 보내요(분은 준비 중)
        </small>
      )}
    </span>
  )
}
