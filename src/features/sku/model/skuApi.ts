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
      'OK' | 'NOT_NEEDED' | 'NOT_CALCULABLE' | 'EXCLUDED' | 'REUPLOAD_REQUIRED'
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
    // 유효 관측일이 모자라 등급을 못 정했으면 null
    grade: 'HIGH' | 'MEDIUM' | 'LOW' | null
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
    }> | null
    range: { low: number; high: number } | null
    firstInboundOn: string | null
  } | null
  trend: Array<{
    date: string
    closingQty: number
    outboundQty: number
    isValidObservation: boolean
  }> | null
}

export type SkuDetail = {
  id: string
  // 시나리오(K2·K3)·AI 인사이트(K4)를 부를 계산 결과 번호. 계산 전이면 null
  resultId: number | null
  // 대시보드 "기준일"과 같은 글자("2026. 11. 4"). 내 입고량이 어느 계산 기준인지 가른다
  baseDate: string
  name: string
  barcode: string
  fulfillment: string
  // 서버가 준 예상 소진일(YYYY-MM-DD). 지났으면 화면이 "품절 주의"를 붙인다
  shortageOn: string | null
  // pending = 아직 계산 전(결과 없음)
  status: 'ready' | 'reference' | 'unavailable' | 'pending'
  unavailableReason?: string
  reuploadRequired?: boolean
  recommendation: {
    quantity: number
    // 단가가 없으면 서버가 사입비를 비워 보낸다(null). 0원으로 바꾸지 않는다.
    cost: number | null
    // 소진일을 계산할 자료가 모자라면 null
    expectedStockoutDate: string | null
  }
  // date는 화면용 "9월 1일", day는 서버가 준 날짜(간격 계산용)
  history: Array<{
    date: string
    day: string
    inventory: number
    outbound: number
  }>
  // 기획서: 평가로 정한 기본 방식을 쓰고, 그 방식을 못 쓰는 상품만 다른 방식으로 대체한다.
  method: { applied: 'A' | 'B'; fallback: boolean; reason: string } | null
  calculation: {
    forecastQty: number | null
    multiplier: number
    coverDays: number
    startingInventory: number | null
    startingInventoryEstimated: boolean
    existingOrders: number | null
    // 입고가 도착하기 전에 이미 못 파는 수요. 권장량 계산에서 뺀다(휘님 시험 자료 B조건 5개)
    preArrivalUnmet: number | null
    inboundUnit: number | null
    rawQuantity: number | null
  }
  settings: ProductDetail['settings']
  accuracy: {
    grade: 'high' | 'medium' | 'low' | null
    coverSuccess: number | null
    coverTrials: number | null
    errorRate: number | null
    range: { low: number; high: number } | null
    history: Array<{
      date: string
      outbound: number
      predictedOutbound: number
    }>
  } | null
}

const UNAVAILABLE = ['NOT_CALCULABLE', 'EXCLUDED', 'REUPLOAD_REQUIRED']

export function toSkuDetail(raw: ProductDetail): SkuDetail {
  const { result, accuracy } = raw
  const status: SkuDetail['status'] = !result
    ? 'pending'
    : UNAVAILABLE.includes(raw.needStatus ?? '') ||
        UNAVAILABLE.includes(result.status)
      ? 'unavailable'
      : accuracy?.isReference
        ? 'reference'
        : 'ready'
  return {
    id: String(raw.product.productId),
    resultId: result?.resultId ?? null,
    baseDate: dotDate(raw.asOfDate),
    name: raw.product.skuName,
    barcode: raw.product.skuBarcode,
    fulfillment: raw.product.fulfillment ?? '',
    shortageOn: raw.expectedShortageOn,
    status,
    reuploadRequired:
      raw.needStatus === 'REUPLOAD_REQUIRED' ||
      result?.status === 'REUPLOAD_REQUIRED',
    unavailableReason:
      raw.needStatus === 'REUPLOAD_REQUIRED'
        ? '자료 기준일이 7일 넘게 지났어요. 최신 수불부를 다시 올려 주세요.'
        : (result?.reason ?? undefined),
    recommendation: {
      quantity: result?.recommendedQty ?? 0,
      cost: result?.recommendedAmount ?? null,
      expectedStockoutDate: raw.expectedShortageOn
        ? dotDate(raw.expectedShortageOn)
        : null,
    },
    history: (raw.trend ?? []).map((day) => ({
      date: monthDay(day.date) ?? day.date,
      day: day.date,
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
      preArrivalUnmet: result?.preArrivalUnmetQty ?? null,
      inboundUnit: raw.settings.orderUnitQty,
      rawQuantity: result?.requiredQtyBeforeRounding ?? null,
    },
    settings: raw.settings,
    accuracy: accuracy && {
      grade: accuracy.grade
        ? (accuracy.grade.toLowerCase() as 'high' | 'medium' | 'low')
        : null,
      coverSuccess: accuracy.coverSuccessCount,
      coverTrials: accuracy.coverTrialCount,
      errorRate:
        accuracy.forecastErrorRate == null
          ? null
          : Math.round(accuracy.forecastErrorRate * 100),
      range: accuracy.range,
      history: (accuracy.history ?? []).map((item) => ({
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
