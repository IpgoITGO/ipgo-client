import { describe, expect, it } from 'vitest'

import { hourLabel, roundTo10 } from './hourLabel'

describe('받을 시각 글자', () => {
  it('분은 10분 단위로 맞추고 자정을 넘기면 0시로', () => {
    expect(roundTo10('09:07')).toBe('09:10')
    expect(roundTo10('09:04')).toBe('09:00')
    expect(roundTo10('09:56')).toBe('10:00')
    expect(roundTo10('23:58')).toBe('00:00')
  })
  it('오전·오후로 읽는다', () => {
    expect(hourLabel(0)).toBe('오전 12시')
    expect(hourLabel(15)).toBe('오후 3시')
  })
})
