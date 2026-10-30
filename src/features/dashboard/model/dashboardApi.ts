import { apiRequest } from '../../../shared/api/client'
import type { DashboardData } from '../pages/DashboardPage'

// ipgo-server README "대시보드와 SKU 상세"(D1). 화면 모양은 그대로 두고 서버 응답을 화면 값으로 옮긴다.
export type ReplenishmentNeeds = {
  asOfDate: string | null
  today: string
  daysSinceAsOf: number | null
  resultStatus: 'UP_TO_DATE' | 'STALE' | null
  runId: number | null
  resultComputedAt: string | null
  lastFailedRunAt: string | null
  latestUploadId: number | null
  summary: {
    needCount: number
    notNeededCount: number
    notCalculableCount: number
    excludedCount: number
  }
  items: Array<{
    productId: number
    resultId: number
    skuBarcode: string
    skuName: string
    recommendedQty: number
    recommendedAmount: number
    expectedShortageOn: string | null
    leadTimeDays: number | null
    preArrivalRisk: number | null
  }>
  notCalculable: Array<{ productId: number; skuName: string; reason: string }>
  excluded: Array<{
    productId: number
    skuName: string
    date: string | null
    reason: string
  }>
}

// 기준일이 7일 넘게 지나면 다시 올려야 한다(서버 REUPLOAD_REQUIRED와 같은 기준).
const REUPLOAD_AFTER_DAYS = 7

// "2026-10-14" → "2026. 10. 14" (화면이 쓰는 날짜 글자)
function dotDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${y}. ${m}. ${d}`
}

// "2026-10-14T09:00:00+09:00" → "10월 14일"
function monthDay(iso: string | null) {
  if (!iso) return undefined
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${m}월 ${d}일`
}

export function toDashboardData(raw: ReplenishmentNeeds): DashboardData {
  return {
    baseDate: dotDate(raw.asOfDate),
    today: dotDate(raw.today),
    freshness:
      (raw.daysSinceAsOf ?? 0) > REUPLOAD_AFTER_DAYS
        ? 'refresh-required'
        : raw.resultStatus === 'STALE'
          ? 'stale-result'
          : 'fresh',
    lastCalculatedAt: monthDay(raw.resultComputedAt),
    summary: {
      needed: raw.summary.needCount,
      safe: raw.summary.notNeededCount,
      unavailable: raw.summary.notCalculableCount,
      excluded: raw.summary.excludedCount,
    },
    neededItems: raw.items.map((item) => ({
      id: String(item.productId),
      name: item.skuName,
      barcode: item.skuBarcode,
      stockoutDate: dotDate(item.expectedShortageOn),
      leadTime: item.leadTimeDays ?? 0,
      quantity: item.recommendedQty,
      cost: item.recommendedAmount,
      // 서버는 0~1 비율, 화면은 퍼센트 숫자
      risk: Math.round((item.preArrivalRisk ?? 0) * 100),
    })),
    unavailableItems: raw.notCalculable.map((item) => ({
      name: item.skuName,
      reason: item.reason,
    })),
    excludedItems: raw.excluded.map((item) => ({
      name: item.skuName,
      reason: item.reason,
    })),
  }
}

// D1 입고 필요 목록. 정렬은 화면에서 하므로 서버 기본(소진일 순)으로 받는다.
export async function getDashboard() {
  return toDashboardData(
    await apiRequest<ReplenishmentNeeds>('/dashboard/replenishment-needs'),
  )
}
