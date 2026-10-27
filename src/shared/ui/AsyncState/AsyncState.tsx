import { Button } from '../Button/Button'
import styles from './AsyncState.module.css'

type AsyncStateProps = {
  description: string
  onRetry?: () => void
  retryLabel?: string
  status: 'loading' | 'error' | 'empty'
  title: string
}

const symbols = {
  loading: '···',
  error: '!',
  empty: '—',
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
      <span aria-hidden="true" className={styles.symbol} data-status={status}>
        {symbols[status]}
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
