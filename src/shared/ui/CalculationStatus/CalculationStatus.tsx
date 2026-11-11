import { useEffect, useEffectEvent, useState } from 'react'

import { useCalculation } from '../../api/calculationContext'
import { useMinutes } from '../../lib/elapsed'
import { Button } from '../Button/Button'
import { CalcMark } from '../CalcMark/CalcMark'
import styles from './CalculationStatus.module.css'

export const DONE_MS = 5000

// 계산 상태: 모든 화면에서 오른쪽 아래 작은 창(본문을 밀지 않는다).
// 계산 중·확인 못 함에는 "계산 멈추기"(서버 취소가 없으면 화면에서만 기다리기를 그만둠).
export function CalculationStatus() {
  const { phase, run, message, retry, dismiss, stop, checkingSince } =
    useCalculation()
  const minutes = useMinutes(checkingSince)
  // 마친 알림은 5초 뒤 저절로 내려간다. 마우스를 올리거나 포커스가 있으면 멈춘다.
  const [hold, setHold] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const close = useEffectEvent(dismiss)
  useEffect(() => {
    if (phase !== 'done' || hold) return
    const leave = window.setTimeout(() => setLeaving(true), DONE_MS)
    const gone = window.setTimeout(close, DONE_MS + 300)
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(gone)
      setLeaving(false)
    }
  }, [phase, hold])
  if (phase === 'idle') return null
  const title = {
    checking: '수불부를 확인하고 있어요',
    pending:
      run?.status === 'QUEUED'
        ? '계산을 기다리고 있어요'
        : '입고량을 계산하고 있어요',
    updating: '새 계산 결과를 불러오고 있어요',
    done: '계산을 마쳤어요',
    failed:
      run?.status === 'CANCELED' ? '계산을 멈췄어요' : '계산을 마치지 못했어요',
    unknown: '계산 결과를 다시 확인해 주세요',
  }[phase]
  const detail =
    message ??
    (phase === 'done' && run?.summary
      ? run.summary.notNeededCount != null
        ? `입고가 필요한 상품 ${run.summary.needCount}개 · 지금은 괜찮은 상품 ${run.summary.notNeededCount}개`
        : `입고가 필요한 상품은 ${run.summary.needCount}개예요.`
      : phase === 'checking'
        ? `${minutes}분째 · 끝나면 화면이 저절로 바뀌어요`
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
      data-leaving={leaving || undefined}
      onBlur={() => setHold(false)}
      onFocus={() => setHold(true)}
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
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
      {/* 제목 줄 오른쪽에 "확인", 설명은 그 아래 창 폭을 다 쓴다(11/11 — 옆에 버튼이 있어 3줄로 꺾이던 것) */}
      <strong className={styles.title}>{title}</strong>
      {(phase === 'done' || phase === 'failed') && (
        <Button aria-label="계산 상태 닫기" onClick={dismiss} variant="text">
          확인
        </Button>
      )}
      {detail && <p className={styles.detail}>{detail}</p>}
      {(phase === 'checking' || phase === 'pending' || phase === 'unknown') && (
        <div className={styles.actions}>
          {phase === 'unknown' && (
            <Button onClick={retry} variant="text">
              상태 다시 확인
            </Button>
          )}
          <Button onClick={() => void stop()} variant="text">
            {phase === 'unknown'
              ? '그만 기다리기'
              : phase === 'checking'
                ? '그만 보기'
                : '계산 멈추기'}
          </Button>
        </div>
      )}
    </section>
  )
}
