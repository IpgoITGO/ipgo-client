import { describe, expect, it } from 'vitest'
import { weeklyFromHistory } from './weekly'

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
