import { useEffect, useId, useRef, useState } from 'react'

import { hourLabel } from './hourLabel'
import styles from './HourPicker.module.css'

const GROUPS = [
  { label: '아침', hours: [6, 7, 8, 9, 10, 11] },
  { label: '낮', hours: [12, 13, 14, 15, 16, 17] },
  { label: '저녁', hours: [18, 19, 20, 21, 22, 23] },
  { label: '새벽', hours: [0, 1, 2, 3, 4, 5] },
]

// 받을 시각 고르기(11/13): 브라우저 기본 선택 칸 대신 우리 칸 + 아침·낮·저녁·새벽 4줄 칩
export function HourPicker({
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
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={styles.box} ref={boxRef}>
      <button
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${label} ${hourLabel(value)}`}
        className={styles.trigger}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        ref={buttonRef}
        type="button"
      >
        {hourLabel(value)}
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          aria-label={label}
          className={styles.panel}
          id={listId}
          role="listbox"
        >
          {GROUPS.map((group) => (
            <div className={styles.group} key={group.label}>
              <span className={styles.groupLabel}>{group.label}</span>
              <div className={styles.chips}>
                {group.hours.map((hour) => (
                  <button
                    aria-label={hourLabel(hour)}
                    aria-selected={hour === value}
                    className={styles.chip}
                    key={hour}
                    onClick={() => {
                      setOpen(false)
                      buttonRef.current?.focus()
                      if (hour !== value) onChange(hour)
                    }}
                    role="option"
                    type="button"
                  >
                    {hour % 12 === 0 ? 12 : hour % 12}시
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
