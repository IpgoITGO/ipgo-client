import { describe, expect, it } from 'vitest'

import { accuracyStats, type AccuracyItem } from './accuracyStats'

const item = (
  outbound: number,
  predictedOutbound: number,
  covered = true,
): AccuracyItem => ({ date: '9/1', outbound, predictedOutbound, covered })

describe('accuracyStats', () => {
  const stats = accuracyStats([
    item(49, 52),
    item(52, 48),
    item(76, 50, false),
    item(40, 50, false),
  ])

  it('품절 피한 횟수와 전체 횟수를 센다', () => {
    expect(stats.total).toBe(4)
    expect(stats.coveredCount).toBe(2)
  })

  it('보통 빗나감 ±N과 범위를 구한다', () => {
    // |3|+|4|+|26|+|10| = 43 / 4 = 10.75 -> 11, 예측 평균 50
    expect(stats.avgPredicted).toBe(50)
    expect(stats.miss).toBe(11)
    expect([stats.low, stats.high]).toEqual([39, 61])
  })

  it('못 판 개수는 품절 난 때 실제가 예측보다 넘친 만큼만 센다', () => {
    expect(stats.lost).toEqual([0, 0, 26, 0])
    expect(stats.lostTotal).toBe(26)
    expect(stats.lostTimes).toBe(1)
  })

  it('가장 크게 넘친 때를 찾는다', () => {
    expect(stats.worst?.over).toBe(26)
  })

  it('최근 10번만 쓴다', () => {
    expect(
      accuracyStats(Array.from({ length: 12 }, () => item(5, 5))).total,
    ).toBe(10)
  })
})
