import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useCalculation } from '../../../shared/api/calculationContext'
import { getCalculationRun } from '../../../shared/api/calculationRunApi'
import {
  durationText,
  shortDate,
  useSeconds,
} from '../../../shared/lib/elapsed'
import { Button } from '../../../shared/ui/Button/Button'
import { CalcMark } from '../../../shared/ui/CalcMark/CalcMark'
import { StepTrack } from '../../../shared/ui/StepTrack/StepTrack'
import styles from './DashboardSkeleton.module.css'

const STEPS = ['수불부 확인', '입고량 계산', '새 결과로 바꾸기'] as const
const ROW_WIDTHS = ['100%', '80%', '65%', '72%']
/** 기다리는 동안 보여 줄 지난 결과 한 마디(전부 대시보드가 이미 가진 값) */
export type WaitNote = {
  baseDate: string
  top?: { name: string; quantity: number }
  needed: number
  soon: number
  planned: number
}

// 계산 중 대시보드: 위는 안내 한 상자(지난 결과 세 줄 포함), 아래는 실제 화면과 같은 배치의 자리.
// 안내 상자 하나에 "무엇을 하는 중 · 얼마나 걸리나 · 그동안 할 수 있는 것"을 모은다(11/17: 띠·상자·알약에 흩어져 있었다)
export function DashboardSkeleton({
  done = false,
  lastRunId,
  note,
  onShowPast,
}: {
  /** 방금 끝났다: 같은 상자에서 초록 체크와 새 결과 한 줄을 잠깐 보여 준다 */
  done?: boolean
  /** 지금 보이는 결과를 만든 계산. 그때 걸린 시간을 진행 막대의 기준으로 쓴다 */
  lastRunId?: number | null
  note?: WaitNote
  onShowPast?: () => void
}) {
  const weekLeft = note && note.soon > 0
  const { phase, checkingSince, run, slow } = useCalculation()
  const [localStart] = useState(() => Date.now())
  const startedAt = run?.startedAt ? Date.parse(run.startedAt) : NaN
  const since =
    phase === 'checking' && checkingSince
      ? checkingSince
      : Number.isFinite(startedAt)
        ? startedAt
        : localStart
  const seconds = useSeconds(since)
  const last = useQuery({
    enabled: lastRunId != null,
    queryFn: () => getCalculationRun(lastRunId as number),
    queryKey: ['calculation-run-duration', lastRunId],
    staleTime: Infinity,
  })
  const lastSeconds =
    last.data?.startedAt && last.data.completedAt
      ? Math.round(
          (Date.parse(last.data.completedAt) -
            Date.parse(last.data.startedAt)) /
            1000,
        )
      : 0
  const over = lastSeconds > 0 && seconds > lastSeconds
  // 단계는 실제 계산 상태 그대로: 수불부 확인 → 입고량 계산 → 새 결과로 바꾸기
  const stepAt = done
    ? STEPS.length
    : phase === 'checking'
      ? 0
      : phase === 'updating'
        ? 2
        : 1
  // 맨 아래 막대가 찬 만큼(0~1). 계산 단계에서 지난 계산 시간을 알 때만 잰다(가짜 퍼센트가 아니다)
  const barRatio =
    phase === 'pending' && lastSeconds > 0 && !slow && !over
      ? Math.min(0.96, seconds / lastSeconds)
      : null
  const summary = run?.summary
  // 끝난 순간: 지난번과 비교한 한 줄(둘 다 아는 값일 때만)
  const change =
    note && summary
      ? note.needed === summary.needCount
        ? '넣어야 할 상품 수는 지난번과 같아요'
        : `넣어야 할 상품이 지난번 ${note.needed}개 → 이번 ${summary.needCount}개로 바뀌었어요`
      : undefined
  return (
    <div className={styles.root} data-testid="dashboard-skeleton">
      <section
        aria-label="계산 중"
        className={styles.wait}
        data-done={done || undefined}
      >
        <div className={styles.talk}>
          <div className={styles.hero}>
            {/* 1·2·3 단계는 상자 맨 위. 지금 단계 둘레에 고리가 돈다(11/17) */}
            <div className={styles.steps}>
              <StepTrack
                at={stepAt}
                busy={!done}
                label="계산 순서"
                steps={STEPS}
              />
            </div>
            <span className={styles.mark}>
              <CalcMark bare state={done ? 'done' : 'running'} />
            </span>
            <strong className={done || slow ? undefined : styles.shimmer}>
              {done
                ? '새 결과로 바꿨어요'
                : slow
                  ? '생각보다 오래 걸리고 있어요'
                  : `새 수불부를 ${phase === 'checking' ? '확인' : '계산'}하고 있어요`}
            </strong>
            <p className={styles.time} role="status">
              {done ? (
                summary ? (
                  <>
                    넣어야 할 상품 <b>{summary.needCount}개</b>
                    {summary.notNeededCount != null &&
                      ` · 지금은 괜찮은 상품 ${summary.notNeededCount}개`}
                  </>
                ) : (
                  '아래에서 새 결과를 확인해 주세요'
                )
              ) : (
                <>
                  <b>{durationText(seconds)}째</b>
                  {slow ? (
                    <>
                      {' · '}
                      <i aria-hidden="true" className={styles.retry} />
                      서버가 다시 시도하고 있어요
                    </>
                  ) : (
                    lastSeconds > 0 &&
                    (over
                      ? ' · 지난번보다 조금 더 걸리고 있어요'
                      : ` · 지난번엔 ${durationText(lastSeconds)} 걸렸어요`)
                  )}
                </>
              )}
            </p>
            {/* 끝난 순간에도 자리는 그대로 둔다 — 상자 높이가 변하지 않게. 안내 글 자리엔 달라진 점 한 줄 */}
            <span
              className={styles.note}
              data-hide={(done && !change) || undefined}
            >
              {done ? change : '창을 닫거나 다른 화면을 봐도 계산은 계속돼요.'}
            </span>
            {onShowPast && note && (
              <span className={styles.past} data-hide={done || undefined}>
                <Button onClick={onShowPast} variant="secondary">
                  지난 결과({shortDate(note.baseDate)}) 보기
                </Button>
              </span>
            )}
          </div>
          {note && (
            <div className={styles.memo}>
              <ul>
                {note.top && (
                  <li>
                    지난번({shortDate(note.baseDate)}) 가장 급했던 건{' '}
                    <mark>{note.top.name}</mark> · 권장{' '}
                    {note.top.quantity.toLocaleString()}개
                  </li>
                )}
                {note.needed > 0 && (
                  <li>
                    지금 넣을 상품 <b>{note.needed}개</b>
                    {weekLeft ? (
                      <>
                        {' '}
                        중 <b>{note.soon}개</b>는 이번 주 안에 바닥나요
                      </>
                    ) : (
                      '가 기다리고 있어요'
                    )}
                  </li>
                )}
                {note.planned > 0 && (
                  <li>
                    정해 둔 내 입고량 <b>{note.planned}개 상품</b>은 새 결과가
                    나와도 그대로 남아요
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
        {/* 맨 아래 막대: 지난 계산이 걸린 시간을 기준으로 찬다. 기준이 없거나 넘기면 빛만 오간다 */}
        <span
          aria-hidden="true"
          className={styles.bar}
          data-unknown={(!done && barRatio === null) || undefined}
        >
          <i
            style={{
              width: done
                ? '100%'
                : barRatio === null
                  ? undefined
                  : `${barRatio * 100}%`,
            }}
          />
        </span>
      </section>

      <div aria-hidden="true" className={styles.rest}>
        <div className={styles.boxes}>
          {/* 실제 화면과 같이 요약 카드 4장(11/12) */}
          {[0, 1, 2, 3].map((i) => (
            <div className={styles.card} key={i}>
              <span className={`${styles.sk} ${styles.a}`} />
              <span className={`${styles.sk} ${styles.b}`} />
              <span className={`${styles.sk} ${styles.c}`} />
            </div>
          ))}
        </div>
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <span className={`${styles.sk} ${styles.search}`} />
          </div>
          <span className={`${styles.sk} ${styles.h}`} />
          {ROW_WIDTHS.map((w) => (
            <div className={styles.row} key={w}>
              <span className={`${styles.sk} ${styles.ck}`} />
              <span className={styles.sk} style={{ width: w }} />
              {/* 상태·소진일·품절 위험·유통기한·입고량·금액 */}
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span className={styles.sk} key={i} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
