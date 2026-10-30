import { describe, expect, it } from 'vitest'

import { type ReplenishmentNeeds, toDashboardData } from './dashboardApi'

const base: ReplenishmentNeeds = {
  asOfDate: '2026-10-14',
  today: '2026-10-19',
  daysSinceAsOf: 5,
  resultStatus: 'UP_TO_DATE',
  runId: 31,
  resultComputedAt: '2026-10-18T09:00:00+09:00',
  lastFailedRunAt: null,
  latestUploadId: 12,
  summary: {
    needCount: 1,
    notNeededCount: 22,
    notCalculableCount: 1,
    excludedCount: 0,
  },
  items: [
    {
      productId: 101,
      resultId: 9001,
      skuBarcode: '8800272420016',
      skuName: '케어트릿 120g',
      recommendedQty: 72,
      recommendedAmount: 129600,
      expectedShortageOn: '2026-10-22',
      leadTimeDays: 5,
      preArrivalRisk: 0.04,
    },
  ],
  notCalculable: [
    { productId: 9, skuName: '신상품', reason: '판매한 날이 7일보다 적어요.' },
  ],
  excluded: [],
}

describe('toDashboardData (서버 D1 → 화면 값)', () => {
  it('날짜·개수·상품 줄을 화면 모양으로 옮긴다', () => {
    const data = toDashboardData(base)

    expect(data).toMatchObject({
      baseDate: '2026. 10. 14',
      today: '2026. 10. 19',
      freshness: 'fresh',
      lastCalculatedAt: '10월 18일',
      summary: { needed: 1, safe: 22, unavailable: 1, excluded: 0 },
      unavailableItems: [
        { name: '신상품', reason: '판매한 날이 7일보다 적어요.' },
      ],
    })
    expect(data.neededItems[0]).toEqual({
      id: '101',
      name: '케어트릿 120g',
      barcode: '8800272420016',
      stockoutDate: '2026. 10. 22',
      leadTime: 5,
      quantity: 72,
      cost: 129600,
      risk: 4,
    })
  })

  it('최근 계산이 실패했으면 지난 결과, 기준일이 7일 넘었으면 다시 올리기', () => {
    expect(toDashboardData({ ...base, resultStatus: 'STALE' }).freshness).toBe(
      'stale-result',
    )
    expect(toDashboardData({ ...base, daysSinceAsOf: 8 }).freshness).toBe(
      'refresh-required',
    )
    expect(toDashboardData({ ...base, daysSinceAsOf: 7 }).freshness).toBe(
      'fresh',
    )
  })

  it('계산 결과가 아직 없으면 기준일을 비워 둔다', () => {
    const data = toDashboardData({
      ...base,
      asOfDate: null,
      daysSinceAsOf: null,
      resultStatus: null,
      runId: null,
      resultComputedAt: null,
      summary: {
        needCount: 0,
        notNeededCount: 0,
        notCalculableCount: 0,
        excludedCount: 0,
      },
      items: [],
      notCalculable: [],
    })

    expect(data.baseDate).toBe('—')
    expect(data.lastCalculatedAt).toBeUndefined()
    expect(data.neededItems).toEqual([])
  })
})
