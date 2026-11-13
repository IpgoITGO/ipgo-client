import { useEffect, useId, useRef, useState } from 'react'

import styles from './TimeField.module.css'

const HOURS = Array.from({ length: 24 }, (_, h) => h)

// 받을 시각(11/14): 시(0~23)만. 칸에 직접 적거나, 누르면 뜨는 우리 고르기 창에서 고른다.
// 브라우저 기본 고르기 창은 파란 네모라 우리 톤과 안 맞아서 직접 그린다. 고른 칸은 둥근 노랑.
// 서버가 시만 받아서(sendHour) 분은 두지 않는다.
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
  const [text, setText] = useState(String(value))
  const [saved, setSaved] = useState(value)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLSpanElement>(null)
  const panelId = useId()
  if (saved !== value) {
    setSaved(value)
    setText(String(value))
  }
  const typed = Number(text)
  const hour =
    text !== '' && Number.isInteger(typed) && typed >= 0 && typed <= 23
      ? typed
      : null

  // 적은 시가 0~23이면 저장, 아니면 원래 값으로
  const commit = () => {
    if (hour === null) {
      setText(String(value))
      return
    }
    setText(String(hour))
    if (hour !== value) onChange(hour)
  }
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })

  useEffect(() => {
    if (!open) return
    // 열면 고른 시가 보이게 줄을 굴려 둔다
    listRef.current
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
          maxLength={2}
          onBlur={() => {
            if (!open) commit()
          }}
          onChange={(event) => setText(event.target.value.replace(/\D/g, ''))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !open) commit()
          }}
          ref={inputRef}
          type="text"
          value={text}
        />
        <span aria-hidden="true" className={styles.unit}>
          시
        </span>
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
            ref={listRef}
            role="listbox"
          >
            {HOURS.map((h) => (
              <button
                aria-label={`${h}시`}
                aria-selected={hour === h}
                className={styles.cell}
                key={h}
                onClick={() => setText(String(h))}
                role="option"
                type="button"
              >
                {h}시
              </button>
            ))}
          </span>
        </span>
      )}
    </span>
  )
}
