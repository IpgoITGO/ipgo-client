import { createContext, useContext } from 'react'

import type { CalculationRun } from './calculationRunApi'

export type CalculationState = {
  runId: number | null
  phase:
    'idle' | 'checking' | 'pending' | 'updating' | 'done' | 'failed' | 'unknown'
  busy: boolean
  run?: CalculationRun
  message?: string
  /** 수불부 확인(정제) 중인 업로드의 시작 시각(ms). 확인 중이 아니면 없다. */
  checkingSince?: number
  /** 업로드가 처리에 들어가면 알려 준다. 끝나면 계산 추적으로 넘어간다. */
  trackUpload: (uploadId: string | null | undefined) => void
  trackRun: (runId: number | null | undefined) => void
  retry: () => void
  dismiss: () => void
  /** 로컬 추적을 즉시 끊고 서버 취소를 별도 요청한다. 서버 중지 성공을 보장하지 않는다. */
  stop: () => void
}

export const CalculationContext = createContext<CalculationState | null>(null)

export function useCalculation() {
  const context = useContext(CalculationContext)
  if (!context) throw new Error('CalculationProvider가 필요합니다.')
  return context
}
