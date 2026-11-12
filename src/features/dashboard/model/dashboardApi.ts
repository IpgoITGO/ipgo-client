import { apiRequest } from '../../../shared/api/client'
import { getUploadResult } from '../../upload/model/uploadApi'
import type { DashboardData } from '../pages/DashboardPage'

/** 판매 급변(ipgo-server #193 요청 중). 최근 7일 하루 평균이 그 전 28일보다 크게 늘면 UP, 급증이 끝나 권장량이 크게 줄면 DOWN. 오기 전엔 없다 */
export type DemandShift = {
  direction: 'UP' | 'DOWN'
  recentDailyQty: number
  baselineDailyQty: number
  ratio: number
  since: string
}

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
    demandShift?: DemandShift | null
  }>
  /** 아직 괜찮은 상품 목록(ipgo-server#103 요청 중). 오기 전에는 없다 */
  notNeededItems?: Array<{
    productId: number
    skuBarcode: string
    skuName: string
    expectedShortageOn: string | null
    leadTimeDays: number | null
    demandShift?: DemandShift | null
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
export function dotDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${y}. ${m}. ${d}`
}

// "2026-10-14T09:00:00+09:00" → "10월 14일"
export function monthDay(iso: string | null) {
  if (!iso) return undefined
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${m}월 ${d}일`
}

export function toDashboardData(
  raw: ReplenishmentNeeds,
  uploadStatus?: DashboardData['uploadStatus'],
): DashboardData {
  return {
    runId: raw.runId,
    baseDate: dotDate(raw.asOfDate),
    today: dotDate(raw.today),
    // 계산을 한 번도 못 했으면 기준일 대신 "계산 전" 안내를 띄운다(SKU 상세와 같은 모양).
    freshness:
      raw.resultStatus === null || raw.asOfDate === null
        ? 'no-result'
        : (raw.daysSinceAsOf ?? 0) > REUPLOAD_AFTER_DAYS
          ? 'refresh-required'
          : raw.resultStatus === 'STALE'
            ? 'stale-result'
            : 'fresh',
    lastCalculatedAt: monthDay(raw.resultComputedAt),
    // 올린 수불부가 실제로 끝났을 때만 "수불부 올리기" 단계를 끝냄으로 센다.
    // 실패했거나 아직 처리 중인 업로드로 입고 조건 화면에 보내면 상품이 없어 막힌다.
    hasUpload:
      raw.latestUploadId !== null &&
      (uploadStatus === undefined || uploadStatus === 'DONE'),
    latestUploadId: raw.latestUploadId,
    uploadStatus,
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
      // 비었으면 0일·0%로 바꾸지 않는다(진짜 0처럼 보임). 화면이 "미입력"·"자료 부족"으로 보여 준다.
      leadTime: item.leadTimeDays,
      quantity: item.recommendedQty,
      cost: item.recommendedAmount,
      // 서버는 0~1 비율, 화면은 퍼센트 숫자
      risk:
        item.preArrivalRisk == null
          ? null
          : Math.round(item.preArrivalRisk * 100),
      shift: item.demandShift ?? null,
    })),
    // 서버가 목록을 주기 전에는 undefined: 화면이 상품 목록 API로 이름·바코드만 채운다
    safeItems: raw.notNeededItems?.map((item) => ({
      id: String(item.productId),
      name: item.skuName,
      barcode: item.skuBarcode,
      stockoutDate: dotDate(item.expectedShortageOn),
      leadTime: item.leadTimeDays,
      shift: item.demandShift ?? null,
    })),
    unavailableItems: raw.notCalculable.map((item) => ({
      id: String(item.productId),
      name: item.skuName,
      reason: item.reason,
    })),
    excludedItems: raw.excluded.map((item) => ({
      id: String(item.productId),
      date: item.date ?? undefined,
      name: item.skuName,
      reason: item.reason,
    })),
  }
}

// D1 입고 필요 목록. 정렬은 화면에서 하므로 서버 기본(소진일 순)으로 받는다.
export async function getDashboard() {
  const raw = await apiRequest<ReplenishmentNeeds>(
    '/dashboard/replenishment-needs',
  )
  // 아직 계산 결과가 없을 때만 마지막 업로드가 끝났는지 한 번 더 본다.
  // 확인하지 못하면(오류) 전과 같이 올린 걸로 본다.
  let uploadStatus: DashboardData['uploadStatus']
  if (raw.resultStatus === null && raw.latestUploadId !== null) {
    try {
      uploadStatus = (await getUploadResult(String(raw.latestUploadId))).status
    } catch {
      uploadStatus = undefined
    }
  }
  return toDashboardData(raw, uploadStatus)
}
