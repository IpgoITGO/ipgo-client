import { ApiError, apiRequest } from './client'

// C2 계산 상태. 팀 API 명세 3.4와 ipgo-server ERD v1 calculation_runs를 따른다.
// 화면은 계산을 직접 시작하지 않는다. 업로드 완료·입고 조건 저장(S2·S3)·발주 저장 응답의 runId로 상태만 본다.
// DONE이면 summary.needCount, FAILED면 errorMessage. 실패해도 서버의 이전 정상 결과는 남는다.
export type CalculationRun = {
  runId: number
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELED'
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

export async function getCalculationRun(runId: number) {
  const run = await apiRequest<CalculationRun>(`/calculation-runs/${runId}`)
  if (
    run.runId !== runId ||
    !['QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELED'].includes(run.status)
  ) {
    throw new ApiError(
      502,
      'INVALID_CALCULATION_STATUS',
      '계산 상태 응답을 확인하지 못했어요.',
    )
  }
  return run
}

// 계산 멈추기(ipgo-server#106). 서버에 아직 취소가 없으면(404·405) false: 화면에서만 기다리기를 그만둔다.
export async function cancelCalculationRun(runId: number) {
  try {
    await apiRequest(`/calculation-runs/${runId}/cancel`, { method: 'POST' })
    return true
  } catch (error) {
    if (error instanceof ApiError && [404, 405].includes(error.status))
      return false
    throw error
  }
}
