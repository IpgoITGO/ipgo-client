import { apiRequest } from '../../../shared/api/client'

// ipgo-server README "입고 조건 (S1~S3)"과 "상품"(P1·P2). 기본 경로 `/api`는 apiRequest가 붙입니다.

export type DefaultSettings = {
  confirmed: boolean
  leadTimeDays: number
  reviewCycleDays: number
  orderUnitQty: number
  reviewCycleSource: 'ESTIMATED' | 'DEFAULT'
}

export type ProductSettings = {
  productId: number
  skuBarcode: string
  skuName: string
  unitCost: number | null
  isActive: boolean
  settings: {
    leadTimeDays: number
    reviewCycleDays: number
    orderUnitQty: number
  }
  // 기본값 대신 상품별 값을 쓰는 칸 이름
  overridden: string[]
}

type Conditions = {
  leadTimeDays: number
  reviewCycleDays: number
  orderUnitQty: number
}

function sendJson(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// S1 기본값. 저장하기 전에는 confirmed: false와 제안값이 온다.
export function getDefaultSettings() {
  return apiRequest<DefaultSettings>('/replenishment-settings')
}

// P1 상품 목록(입고 조건·바꾼 칸 포함). 한 화면에 최대 100개.
export function getProductSettings() {
  return apiRequest<{ items: ProductSettings[]; total: number }>(
    '/products?query=&page=0&size=100',
  )
}

// S2 기본값 저장. recalculate면 값이 같아도 계산을 시작한다.
export function saveDefaultSettings(
  request: Conditions & { recalculate: boolean },
) {
  return apiRequest<{ saved: boolean; runId: number | null }>(
    '/replenishment-settings',
    sendJson('PUT', request),
  )
}

// S3 상품별 입고 조건. 세 칸은 보낸 값으로 모두 바뀌고, unitCost는 보낸 경우에만 바뀐다.
export function saveProductSettings(
  productId: number,
  request: Conditions & { unitCost?: number },
) {
  return apiRequest<{ saved: boolean; runId: number | null }>(
    `/products/${productId}/replenishment-settings`,
    sendJson('PUT', request),
  )
}

// P2 사용 여부 수정. 서버는 업로드에 안 나온 상품을 알아서 끄지 않으므로 셀러가 직접 정한다.
export function setProductActive(productId: number, isActive: boolean) {
  return apiRequest<unknown>(
    `/products/${productId}`,
    sendJson('PATCH', { isActive }),
  )
}
