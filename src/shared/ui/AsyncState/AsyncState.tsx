import { Button } from '../Button/Button'
import styles from './AsyncState.module.css'

type AsyncStateProps = {
  description: string
  onRetry?: () => void
  retryLabel?: string
  status: 'loading' | 'error' | 'empty'
  title: string
}

export function AsyncState({
  description,
  onRetry,
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
      <span aria-hidden="true" className={styles.symbol} data-status={status}>
        <img alt="" height="56" src="/logo.png" width="56" />
        {status === 'error' && <b>!</b>}
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {status === 'loading' && <span className={styles.progress} />}
      {onRetry && (
        <Button onClick={onRetry} variant="secondary">
          {retryLabel}
        </Button>
      )}
    </section>
  )
}
