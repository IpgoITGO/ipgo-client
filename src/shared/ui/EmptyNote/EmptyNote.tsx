import type { ReactNode } from 'react'

import styles from './EmptyNote.module.css'

// 보여 줄 내용이 아직 없을 때: 그림(있으면) → 한 줄 제목 → 한두 문장. 카드 안 가운데에 둔다(11/17).
// "미평가" 같은 낱말을 칸마다 되풀이하지 않고, 왜 없는지와 대신 볼 곳을 한 번만 말한다
export function EmptyNote({
  art,
  children,
  title,
}: {
  /** 그림 주소. 없으면 글만 */
  art?: string
  children: ReactNode
  title: string
}) {
  return (
    <div className={styles.note}>
      {art && (
        <img
          alt=""
          aria-hidden="true"
          className={styles.art}
          height="132"
          src={art}
          width="132"
        />
      )}
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  )
}
