import { describe, expect, it } from 'vitest'

import {
  failText,
  type InsightRaw,
  type ScenariosResponse,
  toInsight,
  toScenario,
  toScenarios,
} from './resultApi'
import model19K2 from './fixtures/model19-k2.json'

it('LGBM19 K2·CUSTOM에 남은 A/B 위험값과 표본을 노출하지 않는다', () => {
  const raw = structuredClone(model19K2) as ScenariosResponse
  raw.preArrivalRisk = 0.98
  raw.riskSampleSize = 42
  raw.scenarios.forEach((item) => {
    item.postArrivalRisk = 0.87
  })
  const result = toScenarios(raw, 'LGBM19')
  expect(result.scenarios.map((item) => item.label)).toEqual([
    '권장량의 80%',
    '권장량 100%',
    '권장량의 120%',
  ])
  for (const scenario of result.scenarios) {
    expect(scenario).toMatchObject({
      preArrivalRisk: null,
      postArrivalRisk: null,
      sampleSize: 0,
    })
  }
  expect(
    toScenario({ ...raw.scenarios[0], type: 'CUSTOM', qty: 84 }, raw, 'LGBM19'),
  ).toMatchObject({
    id: 'custom-84',
    quantity: 84,
    preArrivalRisk: null,
    postArrivalRisk: null,
    sampleSize: 0,
  })
  raw.preArrivalRisk = 0
  raw.scenarios[0].postArrivalRisk = 0
  expect(toScenarios(raw, 'B').scenarios[0]).toMatchObject({
    preArrivalRisk: 0,
    postArrivalRisk: 0,
    sampleSize: 42,
  })
})

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
      preArrivalUnmet: 0,
      recommendedQuantity: 0,
      scenarios: [],
    })
  })
})

describe('toInsight (K4 서버 응답 → 화면, ai#44 U1·U2·U4)', () => {
  it('실제 K4처럼 화면 전용 선택 필드가 없으면 기본값을 적용하고 stale는 보존한다', () => {
    const api = { mode: 'AI', text: '저장된 계산 문장이에요.' }
    expect(toInsight(api)).toMatchObject({
      mode: 'LLM',
      state: 'NORMAL',
      stateReason: null,
      failReason: null,
      stale: false,
      sentences: ['저장된 계산 문장이에요.'],
    })
    expect(toInsight({ ...api, stale: true }).stale).toBe(true)
  })
  const raw: InsightRaw = {
    mode: 'LLM',
    sentences: ['권장량 72개를 입고하면 위험이 낮아져요.'],
    state: 'NORMAL',
    stateReason: null,
    failReason: null,
    stale: false,
  }

  it('명세 이름(AI·FIXED·TABLE_ONLY)도 0002 이름으로 알아듣고, 모르는 이름은 기본 문장으로 본다', () => {
    expect(toInsight({ ...raw, mode: 'AI' }).mode).toBe('LLM')
    expect(toInsight({ ...raw, mode: 'FIXED' }).mode).toBe('TEMPLATE')
    expect(toInsight({ ...raw, mode: 'TABLE_ONLY' }).mode).toBe('NONE')
    expect(toInsight({ ...raw, mode: 'SOMETHING_NEW' }).mode).toBe('TEMPLATE')
  })

  it('문장이 글 하나(draft)로 오면 줄마다 나눈다', () => {
    const { sentences, ...rest } = raw
    void sentences
    expect(
      toInsight({ ...rest, draft: '첫 문장이에요.\n\n 둘째 문장이에요. ' })
        .sentences,
    ).toEqual(['첫 문장이에요.', '둘째 문장이에요.'])
  })

  it.each([
    ['LLM_NOT_CONFIGURED', 'AI 설명 연결이 아직 준비되지 않았어요'],
    ['INVALID_INPUT', 'AI 설명에 필요한 입력을 확인하지 못했어요'],
    ['INPUT_UNAVAILABLE', '설명에 필요한 계산 근거를 확인하지 못했어요'],
  ])(
    '공개 실패 코드 %s를 비활성과 구분하고 맞는 안내로 표시한다',
    (failReason, message) => {
      const insight = toInsight({
        ...raw,
        mode: 'TABLE_ONLY',
        text: null,
        sentences: null,
        isFallback: true,
        failReason,
      })
      expect(insight.explanationDisabled).toBe(false)
      expect(insight.failReason).toBe(failReason)
      expect(failText(failReason)).toBe(message)
    },
  )

  it('모르는 실패 사유도 문구로 보여 준다(undefined가 찍히지 않게)', () => {
    expect(failText('LLM_TIMEOUT')).toBe('AI 응답이 늦었어요')
    expect(failText('VALUE_MISMATCH')).toBe('AI 문장이 계산값과 맞지 않았어요')
    expect(failText('UNKNOWN_INTERNAL_REASON')).toBe('AI 문장을 쓰지 못했어요')
  })
})

it('실제 서버의 TABLE_ONLY 비활성과 실패를 구분한다', () => {
  const raw: InsightRaw = {
    mode: 'TABLE_ONLY',
    isFallback: false,
    text: null,
    state: 'NORMAL',
    stateReason: null,
    failReason: null,
    stale: false,
  }
  expect(toInsight(raw)).toMatchObject({
    mode: 'NONE',
    explanationDisabled: true,
  })
  expect(
    toInsight({ ...raw, isFallback: true, failReason: 'LLM_TIMEOUT' })
      .explanationDisabled,
  ).toBe(false)
  expect(
    toInsight({ ...raw, mode: 'NONE', failReason: 'LLM_DISABLED' })
      .explanationDisabled,
  ).toBe(true)
})

it('주문량 P80/P100/P120은 분위수가 아닌 권장량 비율이며 미산출 위험을 0으로 만들지 않는다', () => {
  const raw: ScenariosResponse = {
    ...base,
    preArrivalRisk: null,
    riskSampleSize: null,
    riskStatus: 'INSUFFICIENT_SAMPLE',
    scenarios: base.scenarios.map((s) => ({
      ...s,
      isDuplicate: false,
      postArrivalRisk: null,
    })),
  }
  const view = toScenarios(raw)
  expect(view.scenarios.map((s) => s.label)).toEqual([
    '권장량의 80%',
    '권장량 100%',
    '권장량의 120%',
  ])
  expect(
    view.scenarios.every(
      (s) => s.preArrivalRisk === null && s.postArrivalRisk === null,
    ),
  ).toBe(true)
})
