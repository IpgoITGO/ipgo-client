import { describe, expect, it } from 'vitest'

import { checkFirst } from './checkFirst'

describe('checkFirst', () => {
  it('판매 급변과 유통기한 지난 재고만 "먼저 확인"으로 고른다', () => {
    const shift = (direction: 'UP' | 'DOWN', ratio: number | null) => ({
      direction,
      ratio,
      recentDailyQty: 8,
      baselineDailyQty: 0.4,
      since: '2026-11-08',
    })
    const reasons = checkFirst(
      [
        { id: '1', name: '급증', quantity: 72, shift: shift('UP', 20) },
        { id: '2', name: '지난 재고', quantity: 40 },
        { id: '3', name: '평소대로', quantity: 60 },
        { id: '4', name: '줄어듦', quantity: 12, shift: shift('DOWN', 0.2) },
        { id: '5', name: '임박만', quantity: 5 },
      ],
      new Map([
        [
          '2',
          {
            expiryDate: '2026-11-13',
            daysLeft: -2,
            status: 'EXPIRED',
            remainingQty: 6,
          },
        ],
        [
          '5',
          {
            expiryDate: '2026-11-27',
            daysLeft: 12,
            status: 'SOON',
            remainingQty: 18,
          },
        ],
      ] as never),
    )
    expect(reasons.map((reason) => reason.id)).toEqual(['1', '2', '4'])
    expect(reasons[0].strong).toBe('20배')
    expect(reasons[0].so).toBe('권장 72개가 모자랄 수 있어요')
    expect(reasons[1].strong).toBe('6개')
    expect(reasons[2].so).toBe('권장 12개가 많을 수 있어요')
  })
})
