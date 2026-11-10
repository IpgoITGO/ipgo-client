import { describe, expect, it } from 'vitest'

import { type ProductDetail, toSkuDetail } from './skuApi'
import accuracyHistoryK1 from './fixtures/accuracy-history-k1.json'

// 서버(K1)가 정확도 등급을 비워 보내는 경우: 유효 관측일이 모자랄 때
const raw = (accuracy: ProductDetail['accuracy']): ProductDetail => ({
  product: {
    productId: 7,
    skuBarcode: '8800272420016',
    skuName: '케어트릿 120g',
    fulfillment: null,
  },
  needStatus: 'NEED_NOW',
  asOfDate: '2026-11-02',
  expectedShortageOn: null,
  settings: {
    leadTimeDays: 5,
    leadTimeSource: 'DEFAULT',
    reviewCycleDays: 14,
    reviewCycleSource: 'DEFAULT',
    orderUnitQty: 12,
    unitCost: null,
  },
  result: null,
  accuracy,
  trend: [],
})

describe('toSkuDetail', () => {
  it('작년 출고의 실제 0은 보존하고 누락·null은 기록 없음으로 전달한다', () => {
    const detail = raw(null)
    detail.trend = [0, null, undefined, 120].map((value, i) => ({
      date: `2026-10-0${i + 1}`,
      closingQty: 10,
      outboundQty: 3,
      isValidObservation: true,
      ...(value === undefined ? {} : { lastYearOutboundQty: value }),
    }))
    expect(
      toSkuDetail(detail).history.map((day) => day.lastYearOutbound),
    ).toEqual([0, null, null, 120])
  })

  it('정확도 등급이 null이어도 깨지지 않고 등급 없음으로 바꾼다', () => {
    const detail = toSkuDetail(
      raw({
        grade: null,
        isReference: false,
        validObservationDays: 4,
        coverSuccessCount: null,
        coverTrialCount: null,
        forecastErrorRate: null,
        history: [],
        range: null,
        firstInboundOn: null,
      }),
    )

    expect(detail.accuracy?.grade).toBeNull()
  })

  it('정확도 목록(history)이나 추이(trend)가 null이어도 빈 목록으로 본다', () => {
    const detail = toSkuDetail({
      ...raw({
        grade: 'HIGH',
        isReference: false,
        validObservationDays: 40,
        coverSuccessCount: 9,
        coverTrialCount: 10,
        forecastErrorRate: 0.12,
        history: null,
        range: null,
        firstInboundOn: null,
      }),
      trend: null,
    })

    expect(detail.accuracy?.grade).toBe('high')
    expect(detail.accuracy?.history).toEqual([])
    expect(detail.history).toEqual([])
  })
})

it('저장된 계산이 OK여도 현재 판정이 재업로드 필요이면 권장값을 정상 상태로 노출하지 않는다', () => {
  const input = raw(null)
  input.needStatus = 'REUPLOAD_REQUIRED'
  input.result = {
    resultId: 1,
    status: 'OK',
    reason: null,
    method: 'B',
    methodReason: '요청 정책의 기본 방식',
    multiplier: 1,
    horizonDays: 14,
    forecastOutboundQty: 42,
    startStockQty: 0,
    startStockEstimated: true,
    plannedReceiptsInHorizon: 0,
    preArrivalUnmetQty: 18,
    requiredQtyBeforeRounding: 24,
    recommendedQty: 24,
    recommendedAmount: 43200,
  }
  expect(toSkuDetail(input)).toMatchObject({
    status: 'unavailable',
    reuploadRequired: true,
  })
  expect(toSkuDetail(input).unavailableReason).toContain('최신 수불부')
})

// 실제 AI 평가 응답을 격리 Spring/H2에 저장한 K1 출력. 합성 자료이며 고객 실측이 아니다.
it('서버 K1의 이력과 평가 구간을 정수 표시값 그대로 변환한다', () => {
  const detail = toSkuDetail(accuracyHistoryK1 as ProductDetail)
  expect(detail.accuracy?.history).toHaveLength(12)
  expect(detail.accuracy?.history[0]).toEqual({
    date: '2026-05-01',
    outbound: 13,
    predictedOutbound: 13,
    covered: true,
  })
  expect(detail.accuracy?.evaluation).toMatchObject({
    status: 'AVAILABLE',
    source: 'HISTORICAL_REPLAY',
    horizonDays: 10,
  })
  expect(detail.accuracy?.coverTrials).toBe(12)
  expect(detail.accuracy?.errorRate).toBe(0)
})
