import { useEffect, useState } from 'react'

import { useCalculation } from '../../api/calculationContext'
import { useMinutes } from '../../lib/elapsed'
import { Button } from '../Button/Button'
import { CalcMark } from '../CalcMark/CalcMark'
import styles from './CalculationStatus.module.css'

/** 펼친 창을 보여 주는 시간. 지나면 오른쪽 아래 작은 알약으로 접힌다. */
export const DONE_MS = 5000

// 계산 상태: 모든 화면에서 오른쪽 아래 작은 창(본문을 밀지 않는다).
// 상태가 바뀌면 펼쳐서 5초 보여 주고 작은 알약으로 접는다(11/12 — 확대한 화면에서 아래 버튼을 가려서).
// 마친·실패 알약은 저절로 사라지지 않고 "확인"을 눌러야 닫힌다. 알약을 누르면 다시 펼친다.
// 계산 중·확인 못 함에는 "계산 멈추기"(서버 취소가 없으면 화면에서만 기다리기를 그만둠).
export function CalculationStatus() {
  const { phase, runId, run, message, retry, dismiss, stop, checkingSince } =
    useCalculation()
  const minutes = useMinutes(checkingSince)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const hold = hovered || focused
  // 같은 단계로 돌아와도 이전 계산의 접힘 상태를 재사용하지 않는다.
  const scope = `${runId}:${checkingSince}:${phase}:${run?.status}`
  const [view, setView] = useState({ scope, compact: false })
  if (view.scope !== scope) {
    setView({ scope, compact: false })
    if (phase === 'idle') {
      setHovered(false)
      setFocused(false)
    }
  }
  const compact = view.scope === scope && view.compact
  useEffect(() => {
    if (phase === 'idle' || hold || compact) return
    const fold = window.setTimeout(
      () => setView({ scope, compact: true }),
      DONE_MS,
    )
    return () => window.clearTimeout(fold)
  }, [phase, scope, hold, compact])
  if (phase === 'idle') return null
  const closable = phase === 'done' || phase === 'failed'
  const markState =
    phase === 'done'
      ? 'done'
      : phase === 'failed' || phase === 'unknown'
        ? 'failed'
        : 'running'
  if (compact) {
    const short = {
      checking: '수불부 확인 중',
      pending: run?.status === 'QUEUED' ? '계산 기다리는 중' : '계산 중',
      updating: '결과 불러오는 중',
      done:
        run?.summary?.needCount != null
          ? `계산 끝 · 넣을 상품 ${run.summary.needCount}개`
          : '계산 끝',
      failed: run?.status === 'CANCELED' ? '계산 멈춤' : '계산 못 마침',
      unknown: '계산 확인 필요',
    }[phase]
    return (
      <section
        aria-label="입고량 계산 상태"
        aria-live="polite"
        className={styles.pill}
        data-tone={markState}
      >
        <button
          className={styles.pillOpen}
          onClick={() => setView({ scope, compact: false })}
          title="누르면 자세히 보여요"
          type="button"
        >
          <CalcMark state={markState} />
          <span>{short}</span>
        </button>
        {closable && (
          <button className={styles.pillClose} onClick={dismiss} type="button">
            확인
          </button>
        )}
      </section>
    )
  }
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
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false)
      }}
      onFocus={() => setFocused(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CalcMark state={markState} />
      {/* 제목 줄 오른쪽에 "확인", 설명은 그 아래 창 폭을 다 쓴다(11/11 — 옆에 버튼이 있어 3줄로 꺾이던 것) */}
      <strong className={styles.title}>{title}</strong>
      {closable && (
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
