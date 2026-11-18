import { useState } from 'react'

import { useCalculation } from '../../../shared/api/calculationContext'
import { shortDate, useMinutes } from '../../../shared/lib/elapsed'
import styles from './BusyStrip.module.css'

// 확인·계산 중에는 아래를 스켈레톤으로 두고 위에 한 줄. "지난 결과 보기"를 누르면 지난 결과를 보여 준다.
// 끝났다는 말은 오른쪽 아래 계산 상태 창이 한다(11/18: 위 노란 띠는 같은 말 반복이라 뺌).
export function BusyStrip({
  baseDate,
  onShowPast,
  quiet,
}: {
  baseDate?: string
  onShowPast?: () => void
  quiet?: boolean
}) {
  const { phase, checkingSince, run } = useCalculation()
  const busy = ['checking', 'pending', 'updating'].includes(phase)
  const [localStart] = useState(() => Date.now())
  const startedAt = run?.startedAt ? Date.parse(run.startedAt) : NaN
  const minutes = useMinutes(
    phase === 'checking'
      ? checkingSince
      : Number.isFinite(startedAt)
        ? startedAt
        : localStart,
  )
  // 계산 중 안내 상자가 같은 말을 하는 화면에서는 띠를 쉰다(11/17)
  if (!busy || quiet) return null
  return (
    <p className={styles.strip} role="status">
      <i aria-hidden="true" className={styles.spinner} />
      <strong>
        새 수불부를 {phase === 'checking' ? '확인' : '계산'}하고 있어요 ·{' '}
        {minutes}분째
      </strong>
      {onShowPast ? (
        <>
          <span>끝나면 여기에 바로 떠요</span>
          {baseDate && (
            <button className={styles.past} onClick={onShowPast} type="button">
              지난 결과({shortDate(baseDate)}) 보기
            </button>
          )}
        </>
      ) : (
        baseDate && <span>아래는 {shortDate(baseDate)} 결과예요</span>
      )}
    </p>
  )
}
