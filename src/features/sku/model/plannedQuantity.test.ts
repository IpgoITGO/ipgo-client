import { beforeEach, expect, it } from 'vitest'

import {
  isOwnPlan,
  isStale,
  loadPlanned,
  type Planned,
  savePlanned,
  shortBasis,
  shortDate,
} from './plannedQuantity'

const plan: Planned = {
  quantity: 60,
  source: 'SCENARIO_80',
  decidedAt: '2026-11-05',
  basis: '2026. 11. 4',
}

beforeEach(() => localStorage.clear())

it('저장하면 불러오고, null이면 지운다', () => {
  expect(loadPlanned()).toEqual({})
  savePlanned('7', plan)
  expect(loadPlanned()).toEqual({ '7': plan })
  savePlanned('7', null)
  expect(loadPlanned()).toEqual({})
})

it('깨진 저장값은 빈 값으로 본다', () => {
  localStorage.setItem('ipgo:planned-quantity', '{oops')
  expect(loadPlanned()).toEqual({})
})

it('기준일이 다르면 지난 계산 기준, 권장 그대로는 내 입고량이 아니다', () => {
  expect(isStale(plan, '2026. 11. 4')).toBe(false)
  expect(isStale(plan, '2026. 11. 6')).toBe(true)
  expect(isOwnPlan(plan)).toBe(true)
  expect(isOwnPlan({ ...plan, source: 'SCENARIO_100' })).toBe(false)
  expect(isOwnPlan(undefined)).toBe(false)
})

it('날짜를 월/일로 줄인다', () => {
  expect(shortDate('2026-11-05')).toBe('11/5')
  expect(shortBasis('2026. 11. 4')).toBe('11/4')
})
