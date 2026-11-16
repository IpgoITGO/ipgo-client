import { describe, expect, it } from 'vitest'

import { type ProductDetail, toSkuDetail } from './skuApi'
import accuracyHistoryK1 from './fixtures/accuracy-history-k1.json'
import model19K1 from './fixtures/model19-k1.json'

it.each(['LGBM19', 'B'])(
  '미산출 %s 평가의 참조 표시로 범위 안내를 만들지 않는다',
  (method) => {
    const input = structuredClone(model19K1) as ProductDetail
    input.result!.method = method
    input.accuracy!.isReference = true
    input.accuracy!.grade = 'LOW'
    expect(toSkuDetail(input).status).toBe('ready')
  },
)

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
it.each(['AVAILABLE', 'EMPTY', 'UNAVAILABLE', null])(
  'LGBM19는 %s 평가에도 기존 A/B 성과를 섞지 않는다',
  (status) => {
    const input = structuredClone(model19K1) as ProductDetail
    input.accuracy = structuredClone(
      accuracyHistoryK1.accuracy,
    ) as ProductDetail['accuracy']
    input.accuracy!.evaluation = status
      ? {
          ...input.accuracy!.evaluation!,
          status: status as 'AVAILABLE' | 'EMPTY' | 'UNAVAILABLE',
        }
      : null
    const view = toSkuDetail(input)
    expect(view.method).toMatchObject({ applied: 'LGBM19', fallback: false })
    expect(view.calculation).toMatchObject({
      forecastQty: 50,
      coverDays: 19,
      rawQuantity: 70,
    })
    expect(view.accuracy).toMatchObject({
      grade: null,
      coverSuccess: null,
      coverTrials: null,
      errorRate: null,
      range: null,
      history: [],
    })
  },
)

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

it.each(['EMPTY', 'UNAVAILABLE'] as const)(
  '명시적 %s 평가의 남은 수치를 실제 성과로 표시하지 않는다',
  (status) => {
    const input = structuredClone(accuracyHistoryK1) as ProductDetail
    input.accuracy!.evaluation!.status = status
    const view = toSkuDetail(input)
    expect(view.accuracy).toMatchObject({
      grade: null,
      coverSuccess: null,
      coverTrials: null,
      errorRate: null,
      range: null,
      history: [],
    })
  },
)

it('미확정 method는 식별자를 보존하고 기존 A/B 평가를 섞지 않는다', () => {
  const input = structuredClone(accuracyHistoryK1) as ProductDetail
  input.result!.method = 'UNAGREED_METHOD_FIXTURE'
  input.result!.methodReason = 'internal/code/model/path 대체'
  input.result!.horizonDays = 19
  const view = toSkuDetail(input)
  expect(view.method).toMatchObject({
    applied: 'UNAGREED_METHOD_FIXTURE',
    fallback: false,
  })
  expect(view.calculation.coverDays).toBe(19)
  expect(view.accuracy).toMatchObject({
    grade: null,
    coverTrials: null,
    errorRate: null,
    range: null,
    history: [],
  })
})

it('평가된 기존 B의 실제 0은 미산출 null로 바꾸지 않는다', () => {
  const input = structuredClone(accuracyHistoryK1) as ProductDetail
  input.result!.method = 'B'
  Object.assign(input.accuracy!, {
    coverSuccessCount: 0,
    coverTrialCount: 3,
    forecastErrorRate: 0,
    range: { low: 0, high: 0 },
  })
  expect(toSkuDetail(input).accuracy).toMatchObject({
    coverSuccess: 0,
    coverTrials: 3,
    errorRate: 0,
    range: { low: 0, high: 0 },
  })
})

it('미확정 방식의 계산 불가·평가 null은 정상 권장 결과로 바꾸지 않는다', () => {
  const input = structuredClone(accuracyHistoryK1) as ProductDetail
  input.needStatus = 'NOT_CALCULABLE'
  Object.assign(input.result!, {
    method: 'UNAGREED_METHOD_FIXTURE',
    status: 'NOT_CALCULABLE',
    recommendedQty: null,
    forecastOutboundQty: null,
  })
  input.accuracy = null
  expect(toSkuDetail(input)).toMatchObject({
    status: 'unavailable',
    accuracy: null,
    calculation: { forecastQty: null },
  })
})
