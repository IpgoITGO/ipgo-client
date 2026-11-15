import { describe, expect, it } from 'vitest'

import { arrivalOn } from './arrivalOn'

describe('arrivalOn', () => {
  it('오늘에 리드타임을 더한 날짜를 주고, 리드타임을 모르면 미정(null)', () => {
    const now = new Date(2026, 10, 28)
    expect(arrivalOn(5, now)).toBe('2026-12-03')
    expect(arrivalOn(0, now)).toBe('2026-11-28')
    expect(arrivalOn(null, now)).toBeNull()
  })
})
