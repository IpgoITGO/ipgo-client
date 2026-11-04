import { useCalculation } from '../../api/calculationContext'
import { Button } from '../Button/Button'
import styles from './CalculationStatus.module.css'

export function CalculationStatus() {
  const { phase, run, message, retry, dismiss } = useCalculation()
  if (phase === 'idle') return null
  const title = {
    pending:
      run?.status === 'QUEUED'
        ? '계산을 기다리고 있어요'
        : '입고량을 계산하고 있어요',
    updating: '새 계산 결과를 불러오고 있어요',
    done: '계산을 마쳤어요',
    failed: '계산을 마치지 못했어요',
    unknown: '계산 결과를 다시 확인해 주세요',
  }[phase]
  return (
    <section
      aria-label="입고량 계산 상태"
      aria-live="polite"
      className={styles.notice}
    >
      <strong>{title}</strong>
      {message && <p>{message}</p>}
      {phase === 'done' && run?.summary && (
        <p>입고가 필요한 상품은 {run.summary.needCount}개예요.</p>
      )}
      {phase === 'pending' && (
        <p>
          이전 결과를 보면서 기다릴 수 있어요. 계산이 끝나면 새로 보여드려요.
        </p>
      )}
      {phase === 'failed' && (
        <p>
          이전 정상 결과는 그대로예요. 입고 조건을 확인한 뒤 다시 계산해 주세요.
        </p>
      )}
      {phase === 'unknown' && (
        <>
          <p>새 계산을 시작하지 않고 같은 계산의 상태를 확인해요.</p>
          <Button onClick={retry} variant="secondary">
            상태 다시 확인
          </Button>
        </>
      )}
      {(phase === 'done' || phase === 'failed') && (
        <Button onClick={dismiss} variant="text">
          확인
        </Button>
      )}
    </section>
  )
}
