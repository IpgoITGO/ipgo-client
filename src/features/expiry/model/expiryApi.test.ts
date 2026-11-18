import { describe, expect, it } from 'vitest'

import { shortExpiry } from './expiryApi'

describe('유통기한 표시', () => {
  it.each([
    ['2027-02-06', '2027.02.06'],
    ['2026-12-31', '2026.12.31'],
    ['2027-01-01', '2027.01.01'],
  ])('해가 바뀌어도 %s의 연도를 생략하지 않는다', (value, expected) => {
    expect(shortExpiry(value)).toBe(expected)
  })
})
