import { apiRequest } from '../../../shared/api/client'

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

export type UploadResult = {
  asOfDate: string
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

// U3 이미 올린 기간 목록
export function getUploadPeriods() {
  return apiRequest<UploadPeriods>('/uploads/periods')
}

// U1 수불부 올리기. 같은 기간을 덮어쓸 때만 overwrite를 true로 보낸다.
export function uploadFiles(files: File[], overwrite: boolean) {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
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
