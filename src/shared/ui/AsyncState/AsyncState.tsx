import type { ReactNode } from 'react'

import { Button } from '../Button/Button'
import styles from './AsyncState.module.css'

type AsyncStateProps = {
  // 설명과 버튼 사이에 넣을 것(예: 계산 전 1·2·3 단계)
  children?: ReactNode
  description: string
  // 불러오는 중에 로고 흔들림·막대 대신 보여 줄 장면(예: 상자 로더)
  loader?: ReactNode
  // 이 화면에서 할 일이 이 버튼 하나뿐이면 노란 주 버튼으로
  primaryAction?: boolean
  onRetry?: () => void
  retryLabel?: string
  status: 'loading' | 'error' | 'empty'
  title: string
}

export function AsyncState({
  children,
  description,
  loader,
  onRetry,
  primaryAction = false,
  retryLabel = '다시 시도',
  status,
  title,
}: AsyncStateProps) {
  return (
    <section
      aria-live={status === 'error' ? 'assertive' : 'polite'}
      className={styles.container}
      role={status === 'error' ? 'alert' : 'status'}
    >
      {/* 글자 기호 대신 로고 상자. 오류면 빨간 표시, 불러오는 중이면 살짝 흔들린다. */}
      {loader && status === 'loading' ? (
        loader
      ) : (
        <span aria-hidden="true" className={styles.symbol} data-status={status}>
          <img alt="" height="56" src="/logo.png" width="56" />
          {status === 'error' && <b>!</b>}
        </span>
      )}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
      {status === 'loading' && !loader && <span className={styles.progress} />}
      {onRetry && (
        <Button
          onClick={onRetry}
          className={primaryAction ? styles.mainAction : undefined}
          variant={primaryAction ? 'primary' : 'secondary'}
        >
          {retryLabel}
        </Button>
      )}
    </section>
  )
}
