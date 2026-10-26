import type { PropsWithChildren } from 'react'

import styles from './PagePlaceholder.module.css'

type PagePlaceholderProps = PropsWithChildren<{
  title: string
  description: string
}>

export function PagePlaceholder({
  children,
  description,
  title,
}: PagePlaceholderProps) {
  return (
    <section className={styles.card}>
      <h1>{title}</h1>
      <p>{description}</p>
      {children && <div className={styles.actions}>{children}</div>}
    </section>
  )
}
