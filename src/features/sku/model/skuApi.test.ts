import { describe, expect, it } from 'vitest'

import { type ProductDetail, toSkuDetail } from './skuApi'

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
