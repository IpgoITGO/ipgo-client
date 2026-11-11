import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { useAuth } from '../../auth/model/useAuth'
import { getDashboard } from '../../features/dashboard/model/dashboardApi'
import { getExpiry } from '../../features/expiry/model/expiryApi'
import { getPlannedReceipts } from '../../features/settings/model/plannedReceiptsApi'
import { buildAlerts } from '../model/alerts'
import styles from './AlertBell.module.css'

const storeKey = (email: string) => `itgo-alerts-read:${email}`

function loadRead(email: string): string[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(storeKey(email)) ?? '[]',
    )
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : []
  } catch {
    return []
  }
}

function saveRead(email: string, keys: string[]) {
  try {
    localStorage.setItem(storeKey(email), JSON.stringify(keys))
  } catch {
    // 저장이 막혀도 이번 화면에서는 읽음으로 보인다
  }
}

// 위쪽 종 모양 알림: 곧 품절 · 유통기한 · 발주 도착일 지남을 한 목록에 모은다.
export function AlertBell() {
  const { status, user } = useAuth()
  const email = user?.email ?? ''
  const enabled = status === 'authenticated'
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    enabled,
  })
  // 서버에 /api/expiry가 아직 없으면(404) 유통기한 알림만 빠진다
  const expiry = useQuery({
    queryKey: ['expiry'],
    queryFn: getExpiry,
    retry: false,
    staleTime: 60_000,
    enabled,
  })
  const receipts = useQuery({
    queryKey: ['planned-receipts'],
    queryFn: getPlannedReceipts,
    enabled,
  })
  const alerts = buildAlerts({
    needed: dashboard.data?.neededItems,
    expiry: expiry.data?.items,
    receipts: receipts.data?.items,
    today: new Date(),
  })

  const [read, setRead] = useState<string[]>(() => loadRead(email))
  const [readFor, setReadFor] = useState(email)
  // 로그인한 사람이 바뀌면 그 사람의 읽음 기록으로(렌더 중 비교)
  if (readFor !== email) {
    setReadFor(email)
    setRead(loadRead(email))
  }
  const count = alerts.filter((a) => !read.includes(a.key)).length

  function markRead(keys: string[]) {
    const next = [...new Set([...read, ...keys])]
    setRead(next)
    saveRead(email, next)
  }

  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }
  const boxRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

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
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={`알림 ${count}개`}
        className={styles.button}
        onClick={() => setOpen((value) => !value)}
        ref={buttonRef}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="20"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
          viewBox="0 0 24 24"
          width="20"
        >
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {count > 0 && (
          <span aria-hidden="true" className={styles.badge}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className={styles.panel} id={panelId}>
          <div className={styles.head}>
            <strong>알림 {count}개</strong>
            <button
              disabled={count === 0}
              onClick={() => markRead(alerts.map((a) => a.key))}
              type="button"
            >
              모두 읽음
            </button>
          </div>
          {alerts.length === 0 ? (
            <p className={styles.empty}>새 알림이 없어요</p>
          ) : (
            <ul className={styles.list}>
              {alerts.map((alert) => (
                <li key={alert.key}>
                  <Link
                    className={styles.row}
                    data-unread={!read.includes(alert.key) || undefined}
                    onClick={() => {
                      markRead([alert.key])
                      setOpen(false)
                    }}
                    to={alert.to}
                  >
                    <span
                      aria-hidden="true"
                      className={`${styles.dot} ${styles[alert.kind]}`}
                    />
                    <span className={styles.text}>
                      <strong>{alert.title}</strong>
                      <span>{alert.reason}</span>
                    </span>
                    <span className={styles.go}>보기 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
