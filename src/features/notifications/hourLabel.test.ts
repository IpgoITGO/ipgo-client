import { describe, expect, it } from 'vitest'

import { hourLabel } from './hourLabel'

describe('받을 시각 글자', () => {
  it('24시간으로 읽는다', () => {
    expect(hourLabel(0)).toBe('0시')
    expect(hourLabel(15)).toBe('15시')
  })
})
