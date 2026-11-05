import { useEffect, useState } from 'react'

import { useCalculation } from '../../../shared/api/calculationContext'
import { shortDate, useMinutes } from '../../../shared/lib/elapsed'
import styles from './BusyStrip.module.css'

const FINISH_STRIP_MS = 4000

// 확인·계산 중에는 지난 결과를 그대로 두고 위에 한 줄만 붙인다. 끝나면 4초간 "바꿨어요".
export function BusyStrip({ baseDate }: { baseDate?: string }) {
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
      {baseDate && <span>아래는 {shortDate(baseDate)} 결과예요</span>}
    </p>
  )
}
