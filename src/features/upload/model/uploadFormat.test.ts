import { describe, expect, it } from 'vitest'

import { formatDate, formatPeriod, formatUploadedAt } from './uploadFormat'

describe('uploadFormat', () => {
  it('날짜와 기간을 화면 글자로 바꾼다', () => {
    expect(formatDate('2026-09-01')).toBe('2026. 9. 1')
    expect(formatPeriod('2026-09-01', '2026-10-14')).toBe(
      '2026. 9. 1 ~ 2026. 10. 14',
    )
  })

  it('일시를 한국 시간 오전·오후로 바꾼다', () => {
    expect(formatUploadedAt('2026-10-15T10:02:00+09:00')).toBe(
      '2026.10.15 오전 10:02',
    )
    expect(formatUploadedAt('2026-10-15T00:05:00+09:00')).toBe(
      '2026.10.15 오전 12:05',
    )
    expect(formatUploadedAt('2026-10-15T15:30:00+09:00')).toBe(
      '2026.10.15 오후 3:30',
    )
  })
})
