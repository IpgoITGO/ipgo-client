import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import styles from './AppLayout.module.css'

// 위쪽 오른쪽 이름을 누르면 여는 작은 메뉴(#187): 내 계정 · 요금제·결제 · 로그아웃.
// 한 달에 한두 번 볼 화면이라 탭을 늘리지 않고 여기에 모았다(11/5 사장님 승인 시안).
export function AccountMenu({
  name,
  company,
  signingOut,
  onSignOut,
}: {
  name: string
  company: string
  signingOut: boolean
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const [lastPath, setLastPath] = useState(pathname)
  const boxRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  // 다른 화면으로 가면 닫는다(렌더 중 비교라 effect가 필요 없다).
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }

  // 바깥을 누르거나 Esc면 닫는다. Esc는 버튼으로 포커스를 돌려준다.
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
    <div className={styles.menuBox} ref={boxRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={`${name} · ${company} 계정 메뉴`}
        className={styles.menuButton}
        onClick={() => setOpen((value) => !value)}
        ref={buttonRef}
        type="button"
      >
        <span className={styles.identity}>
          {name} <span aria-hidden="true">·</span> {company}
        </span>
        {/* 휴대폰에선 이름 대신 짧게 */}
        <span aria-hidden="true" className={styles.menuShort}>
          내 계정
        </span>
        <svg
          aria-hidden="true"
          className={styles.chevron}
          height="8"
          viewBox="0 0 10 6"
          width="10"
        >
          <path
            d="M1 1l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      </button>
      {open && (
        <ul className={styles.menu} id={menuId}>
          <li>
            <Link to="/account">내 계정</Link>
          </li>
          <li>
            <Link to="/plans">요금제·결제</Link>
          </li>
          <li>
            <button
              disabled={signingOut}
              onClick={() => {
                setOpen(false)
                onSignOut()
              }}
              type="button"
            >
              {signingOut ? '로그아웃 중…' : '로그아웃'}
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
