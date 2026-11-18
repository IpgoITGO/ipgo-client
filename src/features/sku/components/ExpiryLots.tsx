import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { shortExpiry, useExpiry } from '../../expiry/model/expiryApi'
import type { ExpiryLot } from '../../expiry/model/expiryApi'
import styles from './ExpiryLots.module.css'

// #434 상품 이름 옆 유통기한 표시(지났거나 임박한 묶음이 있을 때만). 누르면 묶음별 유통기한·입고일·남은 개수·상태를 급한 순서로.
// 요약 한 줄은 이름 옆 표시와 같은 말이라 넣지 않는다(11/18).
// 알림 "보기"로 오면(?expiry=날짜) 처음부터 열고 그 묶음 줄을 한 번 짚는다.
export function ExpiryLots({
  productId,
  openOn,
}: {
  productId: string
  /** 알림이 가리킨 묶음의 유통기한(YYYY-MM-DD). 있으면 열린 채로 시작 */
  openOn?: string | null
}) {
  const expiry = useExpiry()
  // 열림은 "이번 이동"마다 따로 기억한다(#437 리뷰): 같은 상품에서 알림 "보기"를 다시 눌러도,
  // 닫은 뒤 다른 묶음 알림으로 와도 새 이동(location.key)이면 openOn대로 다시 연다.
  const location = useLocation()
  const [toggled, setToggled] = useState<{ key: string; open: boolean } | null>(
    null,
  )
  const open = toggled?.key === location.key ? toggled.open : Boolean(openOn)
  const setOpen = (next: boolean | ((value: boolean) => boolean)) =>
    setToggled({
      key: location.key,
      open: typeof next === 'function' ? next(open) : next,
    })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpen은 이 이동의 열림만 바꾼다
  }, [open])

  const lots = (expiry.data?.items ?? [])
    .filter(
      (lot) => String(lot.productId) === productId && lot.remainingQty > 0,
    )
    .sort(byUrgency)
  const expired = lots.filter((lot) => lot.status === 'EXPIRED')
  const imminent = lots.filter((lot) => lot.status === 'IMMINENT')
  // 문제가 없는 상품은 화면을 바꾸지 않는다
  if (expired.length === 0 && imminent.length === 0) return null

  const urgent = expired.length > 0 ? expired : imminent
  const label = `유통기한 ${expired.length > 0 ? '지남' : '임박'} · ${qty(urgent)}개`

  return (
    <div className={styles.wrap} ref={box}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={styles.badge}
        data-tone={expired.length > 0 ? 'expired' : 'imminent'}
        onClick={() => setOpen((value) => !value)}
        ref={trigger}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 4 2.8 19.5h18.4z" />
          <path d="M12 10v4M12 17v.01" />
        </svg>
        {label}
      </button>
      {open && (
        <div
          aria-label="유통기한 묶음"
          className={styles.panel}
          key={location.key}
          role="dialog"
        >
          <button
            aria-label="닫기"
            className={styles.close}
            onClick={() => {
              setOpen(false)
              trigger.current?.focus()
            }}
            type="button"
          >
            ×
          </button>
          <h2>유통기한 묶음</h2>
          <table>
            <thead>
              <tr>
                <th>유통기한</th>
                <th>입고일</th>
                <th className={styles.num}>남은 개수</th>
                <th className={styles.num}>상태</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot, index) => (
                <tr
                  data-hit={
                    (openOn != null && lot.expiryDate === openOn) || undefined
                  }
                  key={`${lot.expiryDate}-${lot.receivedOn}-${index}`}
                >
                  <td>
                    <b>{lot.expiryDate ? shortExpiry(lot.expiryDate) : '—'}</b>
                  </td>
                  <td>{lot.receivedOn ? shortExpiry(lot.receivedOn) : '—'}</td>
                  <td className={styles.num}>
                    {lot.remainingQty.toLocaleString()}개
                  </td>
                  <td className={styles.num}>
                    <span className={styles.state} data-status={lot.status}>
                      {stateLabel(lot)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const qty = (lots: ExpiryLot[]) =>
  lots.reduce((sum, lot) => sum + lot.remainingQty, 0).toLocaleString()

// 지남(오래된 것부터) → 임박(가까운 것부터) → 정상 → 모름
function byUrgency(a: ExpiryLot, b: ExpiryLot) {
  const rank = (lot: ExpiryLot) =>
    lot.status === 'UNKNOWN' || lot.daysLeft == null ? Infinity : lot.daysLeft
  return rank(a) - rank(b)
}

function stateLabel(lot: ExpiryLot) {
  if (lot.status === 'EXPIRED' && lot.daysLeft != null)
    return lot.daysLeft === 0 ? '오늘 지남' : `${-lot.daysLeft}일 지남`
  if (lot.status === 'IMMINENT' && lot.daysLeft != null)
    return `D-${lot.daysLeft}`
  if (lot.status === 'OK') return '정상'
  return '모름'
}
