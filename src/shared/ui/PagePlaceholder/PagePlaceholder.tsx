import type { PropsWithChildren } from 'react'

import shelfNotFound from './assets/shelf-notfound.webp'
import shelfError from './assets/shelf-error.webp'
import styles from './PagePlaceholder.module.css'

type PagePlaceholderProps = PropsWithChildren<{
  title: string
  description: string
  /** empty = 찾는 게 없음(빈 선반 칸 + 빼꼼 고양이), error = 잠깐 끊김(미끄러진 선반을 고양이가 고치는 중, 겁주지 않게) */
  kind: 'empty' | 'error'
}>

// 막혔을 때 화면: 가운데 카드에 그림 → 제목 → 버튼.
// 페이지 없음은 로그인 그림과 같은 가게 선반 그림(11/13). 그림은 한 번 내려앉고 글·버튼이 떠오른 뒤 멈춘다
export function PagePlaceholder({
  children,
  description,
  kind,
  title,
}: PagePlaceholderProps) {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div aria-hidden="true" className={styles.art} data-kind={kind}>
          <img alt="" src={kind === 'empty' ? shelfNotFound : shelfError} />
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
        {children && <div className={styles.actions}>{children}</div>}
      </section>
    </main>
  )
}
