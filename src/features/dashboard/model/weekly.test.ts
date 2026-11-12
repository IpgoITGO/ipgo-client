import { describe, expect, it } from 'vitest'
import { surgeQuantity, weeklyFromHistory } from './weekly'

describe('weeklyFromHistory', () => {
  it('마지막 날부터 7일씩 묶어 주별 하루 평균(오래된 주 → 이번 주)과 작년 같은 주를 낸다', () => {
    // 15일: 앞 1일은 한 주가 안 돼 버리고, 7일씩 두 주
    const history = Array.from({ length: 15 }, (_, i) => ({
      date: '',
      day: `2026-09-${String(i + 1).padStart(2, '0')}`,
      inventory: 0,
      outbound: i < 8 ? 1 : 4,
      lastYearOutbound: i < 8 ? 2 : null,
    }))
    expect(weeklyFromHistory(history)).toEqual([
      { end: '2026-09-08', avg: 1, lastYear: 2 },
      { end: '2026-09-15', avg: 4, lastYear: null },
    ])
  })
})

describe('surgeQuantity', () => {
  it('최근 하루 판매 × (리드타임 + 입고 주기)를 입고 단위로 올림하고, 설정이 비면 없다', () => {
    expect(surgeQuantity(4, 5, 29, 1)).toBe(136)
    expect(surgeQuantity(4, 5, 29, 12)).toBe(144)
    expect(surgeQuantity(4, null, 29, 1)).toBeNull()
  })
})
