import { useQuery } from '@tanstack/react-query'

import { apiRequest } from '../../../shared/api/client'

// ipgo-server#168 (안) GET /api/expiry — 재고관리단위(입고 묶음)마다 유통기한
export type ExpiryStatus = 'EXPIRED' | 'IMMINENT' | 'OK' | 'UNKNOWN'
export type ExpiryLot = {
  productId: number
  skuBarcode: string
  skuName: string
  receivedOn: string | null
  expiryDate: string | null
  daysLeft: number | null
  remainingQty: number
  status: ExpiryStatus
}
export type ExpiryResponse = {
  asOfDate: string | null
  imminentDays: number
  summary: { expired: number; imminent: number; ok: number; unknown: number }
  items: ExpiryLot[]
}

// 상품 하나에 묶음이 여럿이면 가장 먼저 끝나는 묶음 하나로 본다(남은 수량이 있는 것만)
export type ProductExpiry = {
  expiryDate: string
  daysLeft: number
  status: Exclude<ExpiryStatus, 'UNKNOWN'>
  remainingQty: number
}

export function nearestByProduct(items: ExpiryLot[]) {
  const map = new Map<string, ProductExpiry>()
  for (const lot of items) {
    if (lot.status === 'UNKNOWN' || lot.expiryDate == null) continue
    if (lot.daysLeft == null || lot.remainingQty <= 0) continue
    const key = String(lot.productId)
    const prev = map.get(key)
    if (!prev || lot.daysLeft < prev.daysLeft)
      map.set(key, {
        expiryDate: lot.expiryDate,
        daysLeft: lot.daysLeft,
        status: lot.status,
        remainingQty: lot.remainingQty,
      })
  }
  return map
}

export const getExpiry = () => apiRequest<ExpiryResponse>('/expiry')

// 서버가 아직 없으면(404 등) 화면은 유통기한 칸을 "—"로 두고 막지 않는다
export function useExpiry() {
  return useQuery({
    queryKey: ['expiry'],
    queryFn: getExpiry,
    retry: false,
    staleTime: 60_000,
  })
}

// 임박 기준 일수(ipgo-server#169 GET/PUT /api/settings/expiry, 기본 30, 1~365)
export const getExpirySettings = () =>
  apiRequest<{ imminentDays: number }>('/settings/expiry')
export const saveExpirySettings = (imminentDays: number) =>
  apiRequest<{ imminentDays: number }>('/settings/expiry', {
    method: 'PUT',
    body: JSON.stringify({ imminentDays }),
  })
export function useExpirySettings() {
  return useQuery({
    queryKey: ['expiry-settings'],
    queryFn: getExpirySettings,
    retry: false,
  })
}

// "2026-12-01" → "12/1"
export function shortExpiry(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}`
}
