import { apiRequest } from '../../../shared/api/client'
import { dotDate, monthDay } from '../../dashboard/model/dashboardApi'

// ipgo-server ProductDetail(K1). 계산 결과가 아직 없으면 needStatus · result · accuracy는 null이다.
export type SettingSource = 'PRODUCT' | 'DEFAULT' | 'SUGGESTED' | 'ESTIMATED'

export type ProductDetail = {
  product: {
    productId: number
    skuBarcode: string
    skuName: string
    fulfillment: string | null
  }
  needStatus: string | null
  asOfDate: string | null
  expectedShortageOn: string | null
  settings: {
    leadTimeDays: number | null
    leadTimeSource: SettingSource
    reviewCycleDays: number | null
    reviewCycleSource: SettingSource
    orderUnitQty: number | null
    unitCost: number | null
  }
  result: {
    resultId: number
    status:
      | 'OK'
      | 'NOT_NEEDED'
      | 'NOT_CALCULABLE'
      | 'EXCLUDED'
      | 'REUPLOAD_REQUIRED'
    reason: string | null
    method: 'A' | 'B' | null
    // AI 엔진이 쓴 문장: "평가 결과 기본 방식", "작년 자료 없어 B로 대체"
    methodReason: string | null
    multiplier: number
    horizonDays: number
    forecastOutboundQty: number | null
    startStockQty: number | null
    startStockEstimated: boolean
    plannedReceiptsInHorizon: number | null
    preArrivalUnmetQty: number | null
    requiredQtyBeforeRounding: number | null
    recommendedQty: number | null
    recommendedAmount: number | null
  } | null
  accuracy: {
    grade: 'HIGH' | 'MEDIUM' | 'LOW'
    isReference: boolean
    validObservationDays: number | null
    coverSuccessCount: number | null
    coverTrialCount: number | null
    // 0~1 비율
    forecastErrorRate: number | null
    history: Array<{
      originDate: string
      forecastQty: number
      actualQty: number
      covered: boolean
    }>
    range: { low: number; high: number } | null
    firstInboundOn: string | null
  } | null
  trend: Array<{
    date: string
    closingQty: number
    outboundQty: number
    isValidObservation: boolean
  }>
}

export type SkuDetail = {
  id: string
  name: string
  barcode: string
  fulfillment: string
  // pending = 아직 계산 전(결과 없음)
  status: 'ready' | 'reference' | 'unavailable' | 'pending'
  unavailableReason?: string
  recommendation: {
    quantity: number
    cost: number
    expectedStockoutDate: string
  }
  history: Array<{ date: string; inventory: number; outbound: number }>
  // 기획서: 평가로 정한 기본 방식을 쓰고, 그 방식을 못 쓰는 상품만 다른 방식으로 대체한다.
  method: { applied: 'A' | 'B'; fallback: boolean; reason: string } | null
  calculation: {
    forecastQty: number | null
    multiplier: number
    coverDays: number
    startingInventory: number | null
    startingInventoryEstimated: boolean
    existingOrders: number | null
    inboundUnit: number | null
    rawQuantity: number | null
  }
  settings: ProductDetail['settings']
  accuracy: {
    grade: 'high' | 'medium' | 'low'
    coverSuccess: number | null
    coverTrials: number | null
    errorRate: number | null
    range: { low: number; high: number } | null
    history: Array<{ date: string; outbound: number; predictedOutbound: number }>
  } | null
}

const UNAVAILABLE = ['NOT_CALCULABLE', 'EXCLUDED', 'REUPLOAD_REQUIRED']

export function toSkuDetail(raw: ProductDetail): SkuDetail {
  const { result, accuracy } = raw
  const status: SkuDetail['status'] = !result
    ? 'pending'
    : UNAVAILABLE.includes(result.status)
      ? 'unavailable'
      : accuracy?.isReference
        ? 'reference'
        : 'ready'
  return {
    id: String(raw.product.productId),
    name: raw.product.skuName,
    barcode: raw.product.skuBarcode,
    fulfillment: raw.product.fulfillment ?? '',
    status,
    unavailableReason: result?.reason ?? undefined,
    recommendation: {
      quantity: result?.recommendedQty ?? 0,
      cost: result?.recommendedAmount ?? 0,
      expectedStockoutDate: dotDate(raw.expectedShortageOn),
    },
    history: raw.trend.map((day) => ({
      date: monthDay(day.date) ?? day.date,
      inventory: day.closingQty,
      outbound: day.outboundQty,
    })),
    method: result?.method
      ? {
          applied: result.method,
          fallback: (result.methodReason ?? '').includes('대체'),
          reason: result.methodReason ?? '',
        }
      : null,
    calculation: {
      forecastQty: result?.forecastOutboundQty ?? null,
      multiplier: result?.multiplier ?? 1,
      coverDays: result?.horizonDays ?? 0,
      startingInventory: result?.startStockQty ?? null,
      startingInventoryEstimated: result?.startStockEstimated ?? false,
      existingOrders: result?.plannedReceiptsInHorizon ?? null,
      inboundUnit: raw.settings.orderUnitQty,
      rawQuantity: result?.requiredQtyBeforeRounding ?? null,
    },
    settings: raw.settings,
    accuracy: accuracy && {
      grade: accuracy.grade.toLowerCase() as 'high' | 'medium' | 'low',
      coverSuccess: accuracy.coverSuccessCount,
      coverTrials: accuracy.coverTrialCount,
      errorRate:
        accuracy.forecastErrorRate == null
          ? null
          : Math.round(accuracy.forecastErrorRate * 100),
      range: accuracy.range,
      history: accuracy.history.map((item) => ({
        date: monthDay(item.originDate) ?? item.originDate,
        outbound: item.actualQty,
        predictedOutbound: item.forecastQty,
      })),
    },
  }
}

export async function getSkuDetail(productId: string) {
  return toSkuDetail(
    await apiRequest<ProductDetail>(`/products/${productId}/detail`),
  )
}
