import { apiRequest } from '../../../shared/api/client'
export type Source = {
  uploadId: number
  revision: number
  present: boolean
  quantity: number
  valid: boolean
  fingerprint: string | null
}
export type Allocation = {
  receiptId: number
  quantity: number
  skuName: string
  receivedOn: string | null
}
export type Candidate = {
  receiptId: number
  quantity: number
  expectedOn: string | null
  status: string
  selectable: boolean
}
export type Decision = {
  decisionId: string
  action: string
  reason: string
  actorUserId: number
  createdAt: string
}
export type Review = {
  reviewId: number
  warehouseId: number
  productId: number
  skuName: string
  stockDate: string
  currentState: string
  version: string
  sourceReady: boolean
  originalSource: Source
  currentSource: Source
  allocations: Allocation[]
  candidates: Candidate[]
  capabilities: { keep: boolean; replace: boolean; clear: boolean }
  warnings: string[]
  lastDecision: Decision | null
  decisions: Decision[]
}
export type ReviewPage = { items: Review[]; nextCursor: number | null }
export type PreviewRequest = {
  expectedVersion: string
  action: 'KEEP' | 'REPLACE'
  receiptIds: number[]
}
export type DecisionRequest = PreviewRequest & {
  reason: string
  idempotencyKey: string
}
export type Preview = {
  version: string
  action: string
  before: Allocation[]
  after: Allocation[]
  changes: {
    receiptId: number
    beforeStatus: string
    afterStatus: string
    beforeReflected: boolean
    afterReflected: boolean
  }[]
  warnings: string[]
  mayRecalculate: boolean
}
export type Saved = {
  decisionId: string
  currentState: string
  version: string
  runId: number | null
}
export const listReviews = (state = 'OPEN', cursor = 0) =>
  apiRequest<ReviewPage>(
    `/receipt-corrections?state=${encodeURIComponent(state)}&cursor=${cursor}&size=20`,
  )
export const getReview = (id: number) =>
  apiRequest<Review>(`/receipt-corrections/${id}`)
export const previewReview = (id: number, request: PreviewRequest) =>
  apiRequest<Preview>(`/receipt-corrections/${id}/preview`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
export const decideReview = (id: number, request: DecisionRequest) =>
  apiRequest<Saved>(`/receipt-corrections/${id}/decisions`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
export const reasonText = (reason: string) =>
  ({
    SOURCE_CHANGED: '원본 입고 내용이 바뀌었어요.',
    INSUFFICIENT_QUANTITY: '원본 입고량이 연결된 발주보다 적어요.',
    REGISTRATION_DAY: '발주 등록 당일의 입고는 자동 확정하지 않아요.',
    NO_EXPECTED_DATE: '예정일 없는 발주는 입고 날짜를 확인해야 해요.',
    INVALID_OBSERVATION: '재고 검산을 확인해야 해요.',
    PREVIOUSLY_EVALUATED: '이전에 확인한 입고예요. 현재 상태를 확인해 주세요.',
    LATEST_SOURCE_NOT_READY:
      '최신 원본을 아직 확인할 수 없어요. 정제가 끝난 뒤 다시 확인해 주세요.',
    SOURCE_MISSING: '최신 원본에 이 입고가 없어요.',
  })[reason] ??
  '자동으로 확정할 수 없는 입고예요. 현재 원본과 발주를 확인해 주세요.'
