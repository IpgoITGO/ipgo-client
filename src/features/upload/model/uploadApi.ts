import { apiRequest } from '../../../shared/api/client'
import { validateUploadFile } from './fileValidation'

// 연동 명세 3.2절 (U1·U2·U3)

export type UploadedPeriod = {
  fileName: string
  period: string
  periodEnd: string
  periodStart: string
  status: 'PROCESSING' | 'DONE' | 'FAILED'
  uploadedAt: string
  uploadId: number
}

export type UploadPeriods = {
  items: UploadedPeriod[]
  latestUploadId: number | null
}

// 처리 실패 이유(ipgo-server UploadCleaningService.Failure).
// INVALID_SOURCE = 파일 형식 문제라 고쳐서 다시 올림. 나머지는 서버 쪽 문제라 같은 파일을 잠시 뒤 다시 올림.
export type UploadFailureCode =
  'INVALID_SOURCE' | 'ENGINE_UNAVAILABLE' | 'INVALID_RESULT'

export type UploadResult = {
  receiptMatching?: {
    status: string
    issues: Array<{ productId: number; stockDate: string; reason: string }>
  }

  asOfDate: string
  error?: {
    code: UploadFailureCode | string
    message: string
    reason?: string | null
    details?: { reason?: string | null } | null
  } | null
  matchedReceipts: Array<{
    quantity: number
    receiptId: number
    receivedOn: string
    skuName: string
    status: string
  }>
  periodEnd: string
  periodStart: string
  runId: number | null
  status: 'PROCESSING' | 'DONE' | 'FAILED'
  uploadId: number
  validation: {
    checkedSkuCount: number
    excludedSkus: Array<{
      date: string
      productId: number
      reason: string
      skuBarcode: string
      skuName: string
    }>
    targetSkuCount: number
  }
}

// 입력 오류의 구체적인 이유만 우선한다. 서버 장애의 내부 이유는 화면에 내보내지 않는다.
export function uploadFailureMessage(
  error: UploadResult['error'],
  fallback = '수불부를 처리하지 못했어요.',
) {
  if (error?.code === 'INVALID_SOURCE') {
    if (typeof error.reason === 'string' && error.reason.trim())
      return error.reason.trim()
    if (error.details?.reason === 'PREVIOUS_MONTH_MISMATCH')
      return '전월에 남은 재고가 이번 자료에서 확인되지 않아요. 전월 자료와 같은 셀러·창고의 수불부인지 확인해 주세요.'
  }
  return error?.message?.trim() || fallback
}

// U3 이미 올린 기간 목록
export function getUploadPeriods() {
  return apiRequest<UploadPeriods>('/uploads/periods')
}

// U1 수불부 올리기. 서버 계약상 한 요청에 파일 1개(`file` 칸)만 보낸다. 여러 파일은 화면에서 하나씩.
// 같은 기간을 덮어쓸 때만 overwrite를 true로 보낸다.
export function uploadFile(file: File, overwrite: boolean) {
  const formData = new FormData()
  const validated = validateUploadFile(file)
  if (validated.status !== 'ready' || !validated.periodKey) {
    throw new Error(validated.reason ?? '올릴 수 없는 파일이에요.')
  }
  // 서버의 월별 원본 이름 계약에 맞추되 파일 내용은 그대로 보낸다.
  formData.append('file', file, `${validated.periodKey}.xlsx`)
  formData.append('overwrite', String(overwrite))

  return apiRequest<{ uploadId: number; status: UploadResult['status'] }>(
    '/uploads',
    { body: formData, method: 'POST' },
  )
}

// U2 업로드 결과
export function getUploadResult(uploadId: string) {
  return apiRequest<UploadResult>(`/uploads/${uploadId}`)
}
