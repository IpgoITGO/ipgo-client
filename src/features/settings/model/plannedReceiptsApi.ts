import { apiRequest } from '../../../shared/api/client'

// ipgo-server README "상품과 재고관리단위"(P1)·"기존 발주 물량"(R1~R3). 기본 경로 `/api`는 apiRequest가 붙입니다.

export type Product = {
  productId: number
  skuBarcode: string
  skuName: string
  unitCost: number | null
  isActive: boolean
}

export type ProductPage = {
  items: Product[]
  total: number
  page: number
  size: number
}

// RECEIVED·OVERDUE 판정은 서버의 정제 연동 뒤에 붙지만, 화면은 미리 받아 둡니다.
export type ReceiptStatus = 'PENDING' | 'NO_DATE' | 'RECEIVED' | 'OVERDUE'

export type PlannedReceipt = {
  receiptId: number
  productId: number
  skuName: string
  quantity: number
  expectedOn: string | null
  receivedOn: string | null
  status: ReceiptStatus
  reflected: boolean
}

function sendJson(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// P1 상품 목록. query는 상품명·바코드 일부.
export function getProducts(query: string) {
  const params = new URLSearchParams({ query, page: '0', size: '100' })
  return apiRequest<ProductPage>(`/products?${params}`)
}

// R1 취소하지 않은 발주 목록
export function getPlannedReceipts() {
  return apiRequest<{ items: PlannedReceipt[]; total: number }>(
    '/planned-receipts',
  )
}

// R2 등록. 도착 예정일이 없으면 저장만 되고 계산에는 빠진다(reflected: false).
export function createPlannedReceipt(request: {
  productId: number
  quantity: number
  expectedOn: string | null
}) {
  return apiRequest<{ receiptId: number; reflected: boolean }>(
    '/planned-receipts',
    sendJson('POST', request),
  )
}

// R3 수정. 보낸 칸만 바뀐다.
export function updatePlannedReceipt(
  receiptId: number,
  request: { quantity: number; expectedOn: string | null },
) {
  return apiRequest<unknown>(
    `/planned-receipts/${receiptId}`,
    sendJson('PATCH', request),
  )
}

// R3 취소. 서버는 행을 지우지 않고 CANCELLED로 남긴다.
export function cancelPlannedReceipt(receiptId: number) {
  return apiRequest<void>(`/planned-receipts/${receiptId}`, {
    method: 'DELETE',
  })
}
