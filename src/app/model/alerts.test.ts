import { describe, expect, it } from 'vitest'

import { buildAlerts } from './alerts'

const today = new Date(2026, 10, 11)
const lot = (o: object) => ({
  productId: 1,
  skuBarcode: 'b',
  skuName: '사료',
  receivedOn: null,
  expiryDate: '2026-12-01',
  daysLeft: 12,
  remainingQty: 18,
  status: 'IMMINENT' as const,
  ...o,
})

describe('buildAlerts', () => {
  it('소진일-리드타임이 오늘 이하인 것만, 급한 순으로', () => {
    const list = buildAlerts({
      today,
      needed: [
        { id: '1', name: 'A', stockoutDate: '2026. 11. 14', leadTime: 5 },
        { id: '2', name: 'B', stockoutDate: '2026. 11. 9', leadTime: 5 },
        { id: '3', name: 'C', stockoutDate: '2026. 11. 30', leadTime: 5 },
        { id: '4', name: 'D', stockoutDate: '—', leadTime: 5 },
      ],
    })
    expect(list.map((a) => a.key)).toEqual([
      expect.stringContaining('stock:2'),
      expect.stringContaining('stock:1'),
    ])
    expect(list[0].reason).toBe('이미 소진됐을 수 있어요')
    expect(list[1].reason).toBe('11/14 소진 · 리드타임 5일')
    expect(list[1].to).toBe('/sku/1')
  })

  it('유통기한·발주 알림 문구와 순서', () => {
    const list = buildAlerts({
      today,
      expiry: [
        lot({}),
        lot({ productId: 2, status: 'EXPIRED', remainingQty: 6, daysLeft: -1 }),
        lot({ productId: 3, status: 'OK' }),
      ],
      receipts: [
        {
          receiptId: 7,
          productId: 1,
          skuName: '간식',
          quantity: 5,
          expectedOn: '2026-11-09',
          receivedOn: null,
          status: 'OVERDUE',
          reflected: true,
        },
      ],
    })
    expect(list.map((a) => a.reason)).toEqual([
      '유통기한이 지났어요 · 6개 남음',
      '유통기한 D-12 · 18개 남음',
      '도착 예정일 11/9이 지났어요 · 확인해 주세요',
    ])
    expect(list[2].to).toBe('/settings')
  })
})
