import type { PropsWithChildren } from 'react'

import emptyShelf from './assets/empty-shelf.webp'
import styles from './PagePlaceholder.module.css'

type PagePlaceholderProps = PropsWithChildren<{
  title: string
  description: string
  /** empty = 찾는 게 없음, error = 잠깐 끊김. 그림은 둘 다 같고 글로 나눈다 */
  kind: 'empty' | 'error'
}>

// 막혔을 때 화면: 가운데 카드에 로그인 그림 톤의 조금 빈 선반 + 자는 고양이 → 제목 → 버튼(11/13 "선반 고양이로 통일").
// 그림은 한 번 내려앉고 글·버튼이 떠오른 뒤 멈춘다(계속 움직이지 않음)
export function PagePlaceholder({
  children,
  description,
  kind,
  title,
}: PagePlaceholderProps) {
  return (
    <main className={styles.page}>
      <section className={styles.card} data-kind={kind}>
        <div aria-hidden="true" className={styles.art}>
          <img alt="" src={emptyShelf} />
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
        {children && <div className={styles.actions}>{children}</div>}
      </section>
    </main>
  )
}
