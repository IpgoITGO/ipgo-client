import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { useAuth } from '../../auth/model/useAuth'
import { getDashboard } from '../../features/dashboard/model/dashboardApi'
import { getExpiry } from '../../features/expiry/model/expiryApi'
import { getPlannedReceipts } from '../../features/settings/model/plannedReceiptsApi'
import { type AlertKind, buildAlerts } from '../model/alerts'
import styles from './AlertBell.module.css'
import noAlertsArt from './no-alerts.webp'

// 읽음·지움 기록은 이 브라우저에 사람마다 따로 둔다(알림은 계산 결과에서 만들어지므로 서버에 지울 대상이 없음)
type Store = 'read' | 'cleared'
const storeKey = (store: Store, email: string) =>
  `itgo-alerts-${store}:${email}`

function loadKeys(store: Store, email: string): string[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(storeKey(store, email)) ?? '[]',
    )
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : []
  } catch {
    return []
  }
}

function saveKeys(store: Store, email: string, keys: string[]) {
  try {
    localStorage.setItem(storeKey(store, email), JSON.stringify(keys))
  } catch {
    // 저장이 막혀도 이번 화면에서는 그대로 보인다
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

  const [read, setRead] = useState<string[]>(() => loadKeys('read', email))
  const [cleared, setCleared] = useState<string[]>(() =>
    loadKeys('cleared', email),
  )
  const [readFor, setReadFor] = useState(email)
  // 로그인한 사람이 바뀌면 그 사람의 기록으로(렌더 중 비교)
  if (readFor !== email) {
    setReadFor(email)
    setRead(loadKeys('read', email))
    setCleared(loadKeys('cleared', email))
  }
  // 지운 알림은 목록·숫자에서 빠진다. 상황이 바뀌어 새 알림(다른 key)이 생기면 다시 뜬다
  const visible = alerts.filter((a) => !cleared.includes(a.key))
  const count = visible.filter((a) => !read.includes(a.key)).length

  function markRead(keys: string[]) {
    const next = [...new Set([...read, ...keys])]
    setRead(next)
    saveKeys('read', email, next)
  }

  function clear(keys: string[]) {
    const next = [...new Set([...cleared, ...keys])]
    setCleared(next)
    saveKeys('cleared', email, next)
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
            <strong>알림 {visible.length}개</strong>
            <span className={styles.headActions}>
              <button
                disabled={count === 0}
                onClick={() => markRead(visible.map((a) => a.key))}
                type="button"
              >
                모두 읽음
              </button>
              <button
                disabled={visible.length === 0}
                onClick={() => clear(visible.map((a) => a.key))}
                type="button"
              >
                모두 지우기
              </button>
            </span>
          </div>
          {visible.length === 0 ? (
            // 다 지우거나 없으면 로그인 그림 속 고양이가 잔다(11/13)
            <div className={styles.empty} data-rise="">
              <img alt="" height={96} src={noAlertsArt} width={128} />
              <strong>새 알림이 없어요</strong>
              <span>넣을 상품이 생기면 여기로 알려 드려요</span>
            </div>
          ) : (
            // 종류별로 묶고 머리줄에만 아이콘·색(11/13 B안). 안 읽음은 굵은 제목으로만
            <div className={styles.list}>
              {GROUPS.map(({ kind, label }) => {
                const items = visible.filter((a) => a.kind === kind)
                if (items.length === 0) return null
                return (
                  <section
                    aria-label={`${label} ${items.length}개`}
                    className={styles.group}
                    data-kind={kind}
                    key={kind}
                  >
                    <h3 className={styles.groupHead}>
                      <KindIcon kind={kind} />
                      {label}
                      <span>{items.length}</span>
                    </h3>
                    <ul>
                      {items.map((alert) => (
                        <li className={styles.item} key={alert.key}>
                          <Link
                            className={styles.row}
                            data-unread={!read.includes(alert.key) || undefined}
                            onClick={() => {
                              markRead([alert.key])
                              setOpen(false)
                            }}
                            to={alert.to}
                          >
                            <span className={styles.text}>
                              <strong>{alert.title}</strong>
                              <span>{alert.reason}</span>
                            </span>
                            <span className={styles.go}>보기 →</span>
                          </Link>
                          <button
                            aria-label={`${alert.title} 알림 지우기`}
                            className={styles.clear}
                            onClick={() => clear([alert.key])}
                            title="지우기"
                            type="button"
                          >
                            <svg aria-hidden="true" viewBox="0 0 24 24">
                              <path d="M7 7l10 10M17 7L7 17" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const GROUPS: Array<{ kind: AlertKind; label: string }> = [
  { kind: 'stockout', label: '품절 위험' },
  { kind: 'expiry', label: '유통기한' },
  { kind: 'receipt', label: '입고 확인' },
]

// 색을 못 봐도 구분되게 종류마다 모양이 다른 아이콘(상자 · 모래시계 · 트럭)
function KindIcon({ kind }: { kind: AlertKind }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {kind === 'stockout' && (
        <>
          <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
          <path d="M4 8l8 4 8-4M12 12v8" />
        </>
      )}
      {kind === 'expiry' && (
        <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" />
      )}
      {kind === 'receipt' && (
        <>
          <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
          <circle cx="7" cy="17.5" r="1.6" />
          <circle cx="17" cy="17.5" r="1.6" />
        </>
      )}
    </svg>
  )
}
