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
export function getProducts(query: string, page = 0) {
  const params = new URLSearchParams({ query, page: String(page), size: '100' })
  return apiRequest<ProductPage>(`/products?${params}`)
}

// 대시보드의 전체 상품 분류에는 첫 페이지만 쓰지 않는다.
export async function getAllProducts() {
  const first = await getProducts('')
  const items = [...first.items]
  for (let page = 1; items.length < first.total; page++) {
    const next = await getProducts('', page)
    if (next.items.length === 0) {
      throw new Error('상품 목록을 모두 받지 못했어요. 다시 시도해 주세요.')
    }
    items.push(...next.items)
  }
  return { ...first, items }
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
  return apiRequest<{
    receiptId: number
    reflected: boolean
    runId: number | null
  }>('/planned-receipts', sendJson('POST', request))
}

// R3 수정. 보낸 칸만 바뀐다.
export async function updatePlannedReceipt(
  receiptId: number,
  request: { quantity: number; expectedOn: string | null },
) {
  let runId: number | null = null
  await apiRequest<unknown>(
    `/planned-receipts/${receiptId}`,
    sendJson('PATCH', request),
    (headers) => {
      runId = calculationId(headers)
    },
  )
  return { runId }
}

// R3 취소. 서버는 행을 지우지 않고 CANCELLED로 남긴다.
export async function cancelPlannedReceipt(receiptId: number) {
  let runId: number | null = null
  await apiRequest<void>(
    `/planned-receipts/${receiptId}`,
    {
      method: 'DELETE',
    },
    (headers) => {
      runId = calculationId(headers)
    },
  )
  return { runId }
}

function calculationId(headers: Headers) {
  const raw = headers.get('X-Calculation-Run-Id')
  if (!raw || !/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
