import type { CSSProperties } from 'react'

import styles from './CheckRows.module.css'

// 한 줄: 표시 | 굵은 이름(없어도 됨) | 옅은 설명 | 상태 글.
// 수불부 확인 화면의 파일 줄, 계산 화면의 단계 줄이 같은 모양을 쓴다(11/17).
export type CheckRow = {
  id: string
  state: 'done' | 'failed' | 'now' | 'wait'
  title?: string
  text?: string
  status: string
}

// 줄이 많으면 세 줄만 보이고, 지금 하는 줄이 가운데 오도록 위로 밀려 올라간다.
const VISIBLE_ROWS = 3

// 눈으로 보는 진행 표시라 화면 읽기에는 숨긴다(쓰는 쪽이 제목·진행률로 따로 알린다).
export function CheckRows({ rows }: { rows: CheckRow[] }) {
  const active = Math.max(
    0,
    rows.findIndex((row) => row.state === 'now'),
  )
  const skip = Math.min(
    Math.max(active - 1, 0),
    Math.max(rows.length - VISIBLE_ROWS, 0),
  )
  return (
    <div
      aria-hidden="true"
      className={styles.rows}
      data-many={rows.length > VISIBLE_ROWS || undefined}
    >
      <ol style={{ '--skip': skip } as CSSProperties}>
        {rows.map((row) => (
          <li data-state={row.state} key={row.id}>
            <i />
            {row.title && <b>{row.title}</b>}
            <span title={row.text}>{row.text}</span>
            <em>{row.status}</em>
          </li>
        ))}
      </ol>
    </div>
  )
}
