import { useEffect, useState } from 'react'

import { useCalculation } from '../../../shared/api/calculationContext'
import { shortDate, useMinutes } from '../../../shared/lib/elapsed'
import styles from './BusyStrip.module.css'

const FINISH_STRIP_MS = 4000

// 확인·계산 중에는 아래를 스켈레톤으로 두고 위에 한 줄. "지난 결과 보기"를 누르면 지난 결과를 보여 준다.
// 끝나면 4초간 "바꿨어요".
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
  const [wasBusy, setWasBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  const [localStart] = useState(() => Date.now())
  if (busy && !wasBusy) {
    setWasBusy(true)
    setFinished(false)
  } else if (!busy && wasBusy) {
    setWasBusy(false)
    setFinished(phase === 'done')
  }
  useEffect(() => {
    if (!finished) return
    const timer = setTimeout(() => setFinished(false), FINISH_STRIP_MS)
    return () => clearTimeout(timer)
  }, [finished])
  const startedAt = run?.startedAt ? Date.parse(run.startedAt) : NaN
  const minutes = useMinutes(
    phase === 'checking'
      ? checkingSince
      : Number.isFinite(startedAt)
        ? startedAt
        : localStart,
  )
  // 계산 중 안내 상자가 같은 말을 하는 화면에서는 띠를 쉬고, 끝났을 때 "바꿨어요"만 띄운다(11/17)
  if (busy && quiet) return null
  if (!busy && !finished) return null
  if (!busy)
    return (
      <p className={styles.strip} role="status">
        <strong>새 결과로 바꿨어요</strong>
      </p>
    )
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
