import { apiRequest } from './client'

// C2 계산 상태. 팀 API 명세 3.4와 ipgo-server ERD v1 calculation_runs를 따른다(server #27 IPGO-81에서 구현 예정).
// 화면은 계산을 직접 시작하지 않는다. 업로드 완료·입고 조건 저장(S2·S3)·발주 저장 응답의 runId로 상태만 본다.
// DONE이면 M3 완료 팝업에 summary.needCount, FAILED면 errorMessage. 실패해도 이전 결과(previousRunId)는 남는다.
export type CalculationRun = {
  runId: number
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'
  asOfDate?: string
  engineVersion?: string
  summary?: {
    needCount: number
    notNeededCount: number
    notCalculableCount: number
    excludedCount: number
  }
  startedAt?: string
  completedAt?: string | null
  errorMessage?: string | null
  previousRunId?: number | null
}

export function getCalculationRun(runId: number) {
  return apiRequest<CalculationRun>(`/calculation-runs/${runId}`)
}
