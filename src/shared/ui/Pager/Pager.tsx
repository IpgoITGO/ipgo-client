import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { PAGE_SIZES, pageList } from './pageParams'
import styles from './Pager.module.css'

// 긴 목록 아래 "10·20·30개씩 보기 + 쪽 번호"(11/13). 쪽이 하나뿐이어도 보기 개수는 고를 수 있게 둔다
export function Pager({
  label,
  page,
  size,
  total,
  onPage,
  onSize,
  aside,
}: {
  label: string
  page: number
  size: number
  total: number
  onPage: (page: number) => void
  onSize: (size: number) => void
  /** 오른쪽 끝 빈 칸에 둘 것(예: 대시보드의 "고르면 엑셀로" 안내) */
  aside?: ReactNode
}) {
  const pages = Math.max(1, Math.ceil(total / size))
  return (
    <nav aria-label={`${label} 쪽`} className={styles.pager}>
      <SizePicker label={label} onSize={onSize} size={size} />
      <div className={styles.pages}>
        <button
          aria-label="앞 쪽"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          type="button"
        >
          ‹
        </button>
        {pageList(page, pages).map((item) => (
          <button
            aria-current={item === page ? 'page' : undefined}
            aria-label={`${item}쪽`}
            key={item}
            onClick={() => onPage(item)}
            type="button"
          >
            {item}
          </button>
        ))}
        <button
          aria-label="다음 쪽"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          type="button"
        >
          ›
        </button>
      </div>
      {aside && <div className={styles.aside}>{aside}</div>}
    </nav>
  )
}

// 보기 개수 고르기(11/18): 브라우저 기본 목록 대신 우리 모양 펼침 목록. 위로 펼쳐 표를 가리지 않고, 고른 것은 연노랑 + ✓
function SizePicker({
  label,
  size,
  onSize,
}: {
  label: string
  size: number
  onSize: (size: number) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return
        trigger.current?.focus()
      } else if (box.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div className={styles.size} data-open={open || undefined} ref={box}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${label} 한 번에 볼 개수 ${size}개씩`}
        className={styles.sizeButton}
        onClick={() => setOpen((value) => !value)}
        ref={trigger}
        type="button"
      >
        {size}개씩
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <ul
          aria-label={`${label} 한 번에 볼 개수`}
          className={styles.sizeList}
          role="listbox"
        >
          {PAGE_SIZES.map((option) => (
            <li
              aria-selected={option === size}
              key={option}
              onClick={() => {
                setOpen(false)
                trigger.current?.focus()
                if (option !== size) onSize(option)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.currentTarget.click()
                }
              }}
              role="option"
              tabIndex={0}
            >
              {option}개씩
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
