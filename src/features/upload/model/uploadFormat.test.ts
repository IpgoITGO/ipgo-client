import { describe, expect, it } from 'vitest'

import {
  formatDate,
  formatPeriod,
  formatUploadedAt,
  describeExclusion,
} from './uploadFormat'

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

  it('검산 제외 사유를 꼬리표·한 줄 요약·고칠 곳으로 나눈다', () => {
    expect(
      describeExclusion(
        '전날 재고 + 입고 − 출고 ± 조정이 당일 재고와 3개 달라요',
        '2026-09-12',
      ),
    ).toEqual({
      label: '재고 안 맞음',
      summary: '재고 숫자가 3개 안 맞아요',
      fix: '수불부 9월 12일 행의 재고·입고·출고를 확인해 고쳐 주세요.',
    })
    // 문장 모양이 다르면 원래 문장을 그대로 보여준다
    expect(describeExclusion('출고가 음수예요', '2026-09-03')).toEqual({
      label: '검산 안 맞음',
      summary: '출고가 음수예요',
      fix: null,
    })
  })
})
