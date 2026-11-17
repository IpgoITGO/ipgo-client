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
export function CalculationStatus({
  quiet = false,
}: {
  /** 처음부터 작은 알약으로 둔다(앱 화면은 늘 이렇게 쓴다). 누르면 펼쳐진다 */
  quiet?: boolean
}) {
  const {
    phase,
    runId,
    run,
    message,
    retry,
    dismiss,
    stop,
    checkingSince,
    checkingProgress,
    slow,
  } = useCalculation()
  const minutes = useMinutes(checkingSince)
  const batchDetail = checkingProgress
    ? `${minutes}분째 · ${checkingProgress.total}개 중 ${checkingProgress.completed}개 확인`
    : undefined
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const hold = hovered || focused
  // 같은 단계로 돌아와도 이전 계산의 접힘 상태를 재사용하지 않는다.
  const scope = `${runId}:${checkingSince}:${phase}:${run?.status}`
  // quiet면 끝났을 때·실패했을 때도 알약으로 시작한다(11/17: 펼친 창이 아래 버튼을 가렸다). 눌러야 펼쳐진다
  const startCompact = quiet
  const [view, setView] = useState({ scope, compact: startCompact })
  if (view.scope !== scope) {
    setView({ scope, compact: startCompact })
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
      checking: batchDetail ?? '수불부 확인 중',
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
    // 5분이 넘으면 서버가 다시 시도하는 중이다. 실패로 보이지 않게 말을 바꾼다(#413)
    pending: slow
      ? '생각보다 오래 걸리고 있어요'
      : run?.status === 'QUEUED'
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
        ? (batchDetail ?? `${minutes}분째 · 끝나면 화면이 저절로 바뀌어요`)
        : phase === 'pending' && slow
          ? '다시 시도하고 있어요. 끝나면 화면이 저절로 바뀌어요.'
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
      {/* 왼쪽에 제목·설명 두 줄, 오른쪽 가운데에 "확인"(11/17: 제목·확인·설명이 세 덩어리로 흩어져 보였다) */}
      <p className={styles.line}>
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </p>
      {closable && (
        <Button aria-label="계산 상태 닫기" onClick={dismiss} variant="text">
          확인
        </Button>
      )}
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
