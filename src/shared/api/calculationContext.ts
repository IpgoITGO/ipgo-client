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
}

export const CalculationContext = createContext<CalculationState | null>(null)

export function useCalculation() {
  const context = useContext(CalculationContext)
  if (!context) throw new Error('CalculationProvider가 필요합니다.')
  return context
}
