import { useCalculation } from '../../api/calculationContext'
import { Button } from '../Button/Button'
import { CalcMark } from '../CalcMark/CalcMark'
import styles from './CalculationStatus.module.css'

// 대시보드 밖 화면의 계산 상태: 오른쪽 아래 작은 창(본문을 밀지 않는다). 대시보드는 위 띠로 따로 보여 준다.
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
  const detail =
    message ??
    (phase === 'done' && run?.summary
      ? `입고가 필요한 상품은 ${run.summary.needCount}개예요.`
      : phase === 'pending' || phase === 'updating'
        ? '끝나면 화면이 저절로 바뀌어요.'
        : phase === 'failed'
          ? '이전 결과는 그대로예요.'
          : undefined)
  return (
    <section
      aria-label="입고량 계산 상태"
      aria-live="polite"
      className={styles.window}
    >
      <CalcMark
        state={
          phase === 'done'
            ? 'done'
            : phase === 'failed' || phase === 'unknown'
              ? 'failed'
              : 'running'
        }
      />
      <div className={styles.text}>
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
        {phase === 'unknown' && (
          <Button onClick={retry} variant="text">
            상태 다시 확인
          </Button>
        )}
      </div>
      {(phase === 'done' || phase === 'failed') && (
        <Button aria-label="계산 상태 닫기" onClick={dismiss} variant="text">
          확인
        </Button>
      )}
    </section>
  )
}
