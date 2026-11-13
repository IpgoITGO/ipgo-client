import { describe, expect, it } from 'vitest'

import { hourLabel, parseTime, roundTo10 } from './hourLabel'

describe('받을 시각 글자', () => {
  it('분은 10분 단위로 맞추고 자정을 넘기면 0시로', () => {
    expect(roundTo10('09:07')).toBe('09:10')
    expect(roundTo10('09:04')).toBe('09:00')
    expect(roundTo10('09:56')).toBe('10:00')
    expect(roundTo10('23:58')).toBe('00:00')
  })
  it('24시간으로 읽는다', () => {
    expect(hourLabel(0)).toBe('0시')
    expect(hourLabel(15)).toBe('15시')
  })
  it('적은 글자를 시·분으로 읽는다', () => {
    expect(parseTime('9:7')).toEqual([9, 7])
    expect(parseTime('0930')).toEqual([9, 30])
    expect(parseTime('21')).toEqual([21, 0])
    expect(parseTime('25:00')).toEqual([null, null])
    expect(parseTime('')).toEqual([null, null])
  })
})
