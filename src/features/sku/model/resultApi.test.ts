import { describe, expect, it } from 'vitest'

import { type ScenariosResponse, toScenarios } from './resultApi'

const base: ScenariosResponse = {
  resultId: 9001,
  isEstimate: true,
  preArrivalRisk: 0.04,
  riskSampleSize: 38,
  riskStatus: 'OK',
  scenarios: [
    {
      scenarioId: 1,
      type: 'P80',
      qty: 72,
      isDuplicate: true,
      expectedDepletionOn: '2026-11-18',
      expectedEndingStock: 6,
      unmetDemandQty: 0,
      postArrivalRisk: 0.25,
    },
    {
      scenarioId: 2,
      type: 'P100',
      qty: 72,
      isDuplicate: true,
      expectedDepletionOn: null,
      expectedEndingStock: 6,
      unmetDemandQty: 0,
      postArrivalRisk: 0.08,
    },
    {
      scenarioId: 3,
      type: 'P120',
      qty: 96,
      isDuplicate: false,
      expectedDepletionOn: null,
      expectedEndingStock: 30,
      unmetDemandQty: 0,
      postArrivalRisk: null,
    },
  ],
}

describe('toScenarios (명세 K2 → 화면 카드)', () => {
  it('권장량은 P100, 위험은 % 정수, 권장량과 겹친 카드는 뺀다', () => {
    const { recommendedQuantity, scenarios } = toScenarios(base)

    expect(recommendedQuantity).toBe(72)
    expect(scenarios.map((item) => item.label)).toEqual([
      '권장량 100%',
      '권장량의 120%',
    ])
    expect(scenarios[0]).toMatchObject({
      quantity: 72,
      preArrivalRisk: 4,
      postArrivalRisk: 8,
      expectedStockoutDate: '—',
      sampleSize: 38,
    })
    expect(scenarios[1].postArrivalRisk).toBeNull()
  })

  it('권장량이 0개면 시나리오가 비어 있다', () => {
    expect(toScenarios({ ...base, scenarios: [] })).toEqual({
      recommendedQuantity: 0,
      scenarios: [],
    })
  })
})
