import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useCalculation } from '../../../shared/api/calculationContext'
import { getCalculationRun } from '../../../shared/api/calculationRunApi'
import {
  durationText,
  shortDate,
  useSeconds,
} from '../../../shared/lib/elapsed'
import { BoxLoader } from '../../../shared/ui/BoxLoader/BoxLoader'
import { Button } from '../../../shared/ui/Button/Button'
import { CheckRows } from '../../../shared/ui/CheckRows/CheckRows'
import styles from './DashboardSkeleton.module.css'

const STEPS = ['수불부 확인', '입고량 계산', '새 결과로 바꾸기'] as const
/** 기다리는 동안 견줄 지난 결과(대시보드가 이미 가진 값) */
export type WaitNote = {
  baseDate: string
  needed: number
}

// 계산 중 대시보드: 수불부 확인 화면과 같은 한 장면(그림 → 제목 → 한 줄 → 단계 줄 → 지난 결과 보기).
// 11/17: 단계 동그라미·상자 둘레 고리·아래 진행 막대·지난 결과 메모가 한꺼번에 있어 볼 게 너무 많았다. 움직이는 건 그림과 지금 단계 표시뿐이다.
export function DashboardSkeleton({
  done = false,
  lastRunId,
  note,
  onShowPast,
}: {
  /** 방금 끝났다: 같은 상자에서 초록 체크와 새 결과 한 줄을 잠깐 보여 준다 */
  done?: boolean
  /** 지금 보이는 결과를 만든 계산. 그때 걸린 시간을 지금 단계 줄에 견주어 보여 준다 */
  lastRunId?: number | null
  note?: WaitNote
  onShowPast?: () => void
}) {
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
  // 단계는 실제 계산 상태 그대로: 수불부 확인 → 입고량 계산 → 새 결과로 바꾸기
  const stepAt = done
    ? STEPS.length
    : phase === 'checking'
      ? 0
      : phase === 'updating'
        ? 2
        : 1
  // 지금 단계 줄의 옅은 설명: 다시 시도 중이거나, 지난 계산이 걸린 시간(아는 값일 때만)
  const hint = slow
    ? '서버가 다시 시도하고 있어요'
    : phase === 'pending' && lastSeconds > 0
      ? seconds > lastSeconds
        ? '지난번보다 조금 더 걸리고 있어요'
        : `지난번엔 ${durationText(lastSeconds)} 걸렸어요`
      : undefined
  const summary = run?.summary
  return (
    <div className={styles.root} data-testid="dashboard-skeleton">
      <section aria-label="계산 중" className={styles.wait}>
        <BoxLoader done={done} title="수불부" />
        <strong>
          {done
            ? '새 결과로 바꿨어요'
            : slow
              ? '생각보다 오래 걸리고 있어요'
              : `새 수불부를 ${phase === 'checking' ? '확인' : '계산'}하고 있어요`}
        </strong>
        <p role="status">
          {done ? (
            summary ? (
              // 지난번과 넣어야 할 상품 수가 달라졌으면 그걸, 같으면 이번 결과를 한 줄로
              note && note.needed !== summary.needCount ? (
                <>
                  넣어야 할 상품이 지난번 {note.needed}개 → 이번{' '}
                  <b>{summary.needCount}개</b>로 바뀌었어요
                </>
              ) : (
                <>
                  넣어야 할 상품 <b>{summary.needCount}개</b>
                  {summary.notNeededCount != null &&
                    ` · 지금은 괜찮은 상품 ${summary.notNeededCount}개`}
                </>
              )
            ) : (
              '아래에서 새 결과를 확인해 주세요'
            )
          ) : (
            '창을 닫거나 다른 화면을 봐도 계산은 계속돼요.'
          )}
        </p>
        <CheckRows
          rows={STEPS.map((title, index) => ({
            id: title,
            title,
            state: index < stepAt ? 'done' : index === stepAt ? 'now' : 'wait',
            text: index === stepAt ? hint : undefined,
            status:
              index < stepAt
                ? '끝'
                : index === stepAt
                  ? `${durationText(seconds)}째`
                  : '기다림',
          }))}
        />
        {/* 끝난 순간에도 자리는 그대로 둔다 — 상자 높이가 변하지 않게 */}
        {onShowPast && note && (
          <span className={styles.past} data-hide={done || undefined}>
            <Button onClick={onShowPast} variant="text">
              지난 결과({shortDate(note.baseDate)}) 보기 →
            </Button>
          </span>
        )}
      </section>
    </div>
  )
}
