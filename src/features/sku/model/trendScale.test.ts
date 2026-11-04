import { describe, expect, it } from 'vitest'

import { niceStep, tickText } from './trendScale'

describe('trendScale', () => {
  it('재고가 아무리 커도 눈금은 6개 이하다', () => {
    for (const max of [8, 45, 100, 730, 5000, 100000, 2500000]) {
      const step = niceStep(max)
      const count = Math.ceil(max / step) + 1
      expect(count).toBeLessThanOrEqual(7)
    }
    expect(niceStep(100000)).toBe(20000)
    expect(niceStep(45)).toBe(10)
  })

  it('큰 눈금은 만 단위로 줄여 쓴다', () => {
    expect(tickText(0)).toBe('0')
    expect(tickText(500)).toBe('500')
    expect(tickText(20000)).toBe('2만')
    expect(tickText(15000)).toBe('1.5만')
  })
})
