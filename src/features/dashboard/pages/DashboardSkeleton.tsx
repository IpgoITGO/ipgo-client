import type { CSSProperties } from 'react'

import { shortDate } from '../../../shared/lib/elapsed'
import styles from './DashboardSkeleton.module.css'

const ROW_WIDTHS = ['100%', '80%', '65%', '72%']
// 상자마다 크기·출발 시각을 달리해 줄이 기계처럼 똑같아 보이지 않게
const BOXES = [
  { size: 1, delay: 0 },
  { size: 0.82, delay: -2.1 },
  { size: 1.12, delay: -4.4 },
  { size: 0.9, delay: -6.5 },
  { size: 1, delay: -8.6 },
]

/** 기다리는 동안 보여 줄 지난 결과 한 마디(전부 대시보드가 이미 가진 값) */
export type WaitNote = {
  baseDate: string
  top?: { name: string; quantity: number }
  needed: number
  soon: number
  planned: number
}

function Box({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 44 40">
      {open && (
        <>
          <path
            d="M6 13 L1 5 L20 9 L22 15 Z"
            fill="#f6d28a"
            stroke="#a8641a"
            strokeLinejoin="round"
            strokeWidth="1.3"
          />
          <path
            d="M38 13 L43 5 L24 9 L22 15 Z"
            fill="#eebd62"
            stroke="#a8641a"
            strokeLinejoin="round"
            strokeWidth="1.3"
          />
        </>
      )}
      <path
        d="M4 13 L22 18 L22 38 L4 33 Z"
        fill="#efbd63"
        stroke="#a8641a"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <path
        d="M22 18 L40 13 L40 33 L22 38 Z"
        fill="#dda04a"
        stroke="#a8641a"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <path
        d="M4 13 L22 8 L40 13 L22 18 Z"
        fill={open ? '#7a4a12' : '#f8d68f'}
        stroke="#a8641a"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      {!open && (
        <path
          d="M10 11.3 L28 16.3 L34 14.6 L16 9.6 Z"
          fill="#ffc53d"
          opacity=".95"
        />
      )}
    </svg>
  )
}

// 계산 중 대시보드: 위는 상자가 지나가는 줄과 지난 결과 한 마디, 아래는 실제 화면과 같은 배치의 자리.
export function DashboardSkeleton({ note }: { note?: WaitNote }) {
  const weekLeft = note && note.soon > 0
  return (
    <div className={styles.root} data-testid="dashboard-skeleton">
      <section aria-label="계산 중" className={styles.wait}>
        <div aria-hidden="true" className={styles.line}>
          {BOXES.map((box, i) => (
            <span
              className={styles.box}
              key={i}
              style={
                {
                  '--d': `${box.delay}s`,
                  '--i': i,
                  width: `${44 * box.size}px`,
                } as CSSProperties
              }
            >
              <span className={styles.before}>
                <Box open />
              </span>
              <span className={styles.after}>
                <Box open={false} />
              </span>
            </span>
          ))}
          <span className={styles.gate}>
            <b>ITGO</b>
          </span>
          <span className={styles.belt} />
        </div>
        <div className={styles.talk}>
          <div className={styles.say}>
            <strong>새 수불부로 입고량을 계산하고 있어요</strong>
            <span>
              창을 닫거나 다른 화면을 봐도 계산은 계속돼요. 끝나면 오른쪽
              아래에서 알려 드려요.
            </span>
          </div>
          {note && (
            <div className={styles.memo}>
              <span aria-hidden="true" className={styles.hand}>
                기다리는 동안…
              </span>
              <ul>
                {note.top && (
                  <li>
                    지난번({shortDate(note.baseDate)}) 가장 급했던 건{' '}
                    <mark>{note.top.name}</mark> · 권장{' '}
                    {note.top.quantity.toLocaleString()}개
                  </li>
                )}
                {note.needed > 0 && (
                  <li>
                    지금 넣을 상품 <b>{note.needed}개</b>
                    {weekLeft ? (
                      <>
                        {' '}
                        중 <b>{note.soon}개</b>는 이번 주 안에 바닥나요
                      </>
                    ) : (
                      '가 기다리고 있어요'
                    )}
                  </li>
                )}
                {note.planned > 0 && (
                  <li>
                    정해 둔 내 입고량 <b>{note.planned}개 상품</b>은 새 결과가
                    나와도 그대로 남아요
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </section>

      <div aria-hidden="true" className={styles.rest}>
        <div className={styles.boxes}>
          {[0, 1, 2, 3].map((i) => (
            <div className={styles.card} key={i}>
              <span className={`${styles.sk} ${styles.a}`} />
              <span className={`${styles.sk} ${styles.b}`} />
              <span className={`${styles.sk} ${styles.c}`} />
            </div>
          ))}
        </div>
        <div className={styles.panel}>
          <span className={`${styles.sk} ${styles.h}`} />
          {ROW_WIDTHS.map((w) => (
            <div className={styles.row} key={w}>
              <span className={`${styles.sk} ${styles.ck}`} />
              <span className={styles.sk} style={{ width: w }} />
              {[0, 1, 2, 3, 4].map((i) => (
                <span className={styles.sk} key={i} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
