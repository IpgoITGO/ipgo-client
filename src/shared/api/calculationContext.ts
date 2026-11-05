import { createContext, useContext } from 'react'

import type { CalculationRun } from './calculationRunApi'

export type CalculationState = {
  runId: number | null
  phase: 'idle' | 'pending' | 'updating' | 'done' | 'failed' | 'unknown'
  busy: boolean
  run?: CalculationRun
  message?: string
  trackRun: (runId: number | null | undefined) => void
  retry: () => void
  dismiss: () => void
  /** 계산 멈추기: 서버 취소를 요청하고(없으면 건너뜀) 이 계산을 더 기다리지 않는다 */
  stop: () => Promise<void>
}

export const CalculationContext = createContext<CalculationState | null>(null)

export function useCalculation() {
  const context = useContext(CalculationContext)
  if (!context) throw new Error('CalculationProvider가 필요합니다.')
  return context
}
