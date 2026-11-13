import { useEffect, useId, useRef, useState } from 'react'

import { pad, parseTime, roundTo10 } from './hourLabel'
import styles from './TimeField.module.css'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const MINUTES = [0, 10, 20, 30, 40, 50]

// 받을 시각(11/14): 칸에 직접 적거나, 누르면 뜨는 우리 고르기 창(시 0~23 / 분 10분 단위)에서 고른다.
// 브라우저 기본 고르기 창은 파란 네모라 우리 톤과 안 맞아서 직접 그린다. 고른 칸은 둥근 노랑.
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
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const hourListRef = useRef<HTMLSpanElement>(null)
  const panelId = useId()
  // 서버 값이 바뀌면 칸도 맞춘다. 방금 고른 시와 같으면 적어 둔 분은 그대로 둔다(18:20 → 18:00으로 안 지워지게)
  if (saved !== value) {
    setSaved(value)
    if (parseTime(text)[0] !== value) setText(`${pad(value)}:00`)
  }
  const [hour, minute] = parseTime(text)

  // 적은 글자를 HH:MM(10분 단위)으로 맞추고, 시가 바뀌었으면 저장
  const commit = () => {
    const [h, m] = parseTime(text)
    if (h === null) {
      setText(`${pad(value)}:00`)
      return
    }
    const next = roundTo10(`${pad(h)}:${pad(m ?? 0)}`)
    setText(next)
    const nextHour = Number(next.slice(0, 2))
    if (nextHour !== value) onChange(nextHour)
  }
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })

  useEffect(() => {
    if (!open) return
    // 열면 고른 시가 보이게 시 줄을 굴려 둔다
    hourListRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'center' })
    function close() {
      setOpen(false)
      commitRef.current()
    }
    function onPointer(event: PointerEvent) {
      if (!boxRef.current?.contains(event.target as Node)) close()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' && event.key !== 'Enter') return
      event.preventDefault()
      close()
      inputRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (h: number | null, m: number | null) =>
    setText(`${pad(h ?? hour ?? value)}:${pad(m ?? minute ?? 0)}`)

  return (
    <span className={styles.box} ref={boxRef}>
      <span
        className={styles.field}
        data-disabled={disabled || undefined}
        data-open={open || undefined}
        onClick={() => {
          if (!disabled) setOpen(true)
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
        <input
          aria-controls={panelId}
          aria-expanded={open}
          aria-label={label}
          className={styles.input}
          disabled={disabled}
          inputMode="numeric"
          maxLength={5}
          onBlur={() => {
            if (!open) commit()
          }}
          onChange={(event) =>
            setText(event.target.value.replace(/[^\d:]/g, ''))
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !open) commit()
          }}
          placeholder="09:00"
          ref={inputRef}
          type="text"
          value={text}
        />
      </span>
      {open && (
        <span
          aria-label={`${label} 고르기`}
          className={styles.panel}
          id={panelId}
          role="dialog"
        >
          <span
            aria-label="시"
            className={styles.col}
            ref={hourListRef}
            role="listbox"
          >
            {HOURS.map((h) => (
              <button
                aria-label={`${h}시`}
                aria-selected={hour === h}
                className={styles.cell}
                key={h}
                onClick={() => pick(h, null)}
                role="option"
                type="button"
              >
                {pad(h)}
              </button>
            ))}
          </span>
          <span aria-label="분" className={styles.col} role="listbox">
            {MINUTES.map((m) => (
              <button
                aria-label={`${m}분`}
                aria-selected={minute === m}
                className={styles.cell}
                key={m}
                onClick={() => pick(null, m)}
                role="option"
                type="button"
              >
                {pad(m)}
              </button>
            ))}
          </span>
        </span>
      )}
      {minute !== null && minute > 0 && (
        <small className={styles.note}>
          지금은 {hour}시 정각에 보내요 · 분은 준비 중
        </small>
      )}
    </span>
  )
}
