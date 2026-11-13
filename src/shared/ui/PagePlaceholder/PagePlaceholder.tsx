import type { PropsWithChildren } from 'react'

import boxEmpty from './assets/box-empty.webp'
import boxUnplugged from './assets/box-unplugged.webp'
import styles from './PagePlaceholder.module.css'

type PagePlaceholderProps = PropsWithChildren<{
  title: string
  description: string
  /** empty = 찾는 게 없음(빈 상자+돋보기), error = 잠깐 끊김(플러그 빠진 상자+불꽃) */
  kind: 'empty' | 'error'
}>

// 막혔을 때 화면(11/11): 가운데 카드에 ITGO 상자 그림 → 제목 → 버튼.
// 상자는 한 번 툭 떨어져 멈추고, 오류면 불꽃이 두 번 반짝하고 끝난다(계속 움직이지 않음)
export function PagePlaceholder({
  children,
  description,
  kind,
  title,
}: PagePlaceholderProps) {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div aria-hidden="true" className={styles.art}>
          <img alt="" src={kind === 'empty' ? boxEmpty : boxUnplugged} />
          {kind === 'error' && <i className={styles.spark} />}
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
        {children && <div className={styles.actions}>{children}</div>}
      </section>
    </main>
  )
}
