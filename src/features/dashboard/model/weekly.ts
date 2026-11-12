import type { SkuDetail } from '../../sku/model/skuApi'

type History = SkuDetail['history']

export type Week = { end: string; avg: number; lastYear: number | null }

// 하루 출고를 마지막 날부터 7일씩 묶어 주별 하루 평균으로(오래된 주 → 이번 주)
export function weeklyFromHistory(history: History, weeks = 13): Week[] {
  const out: Week[] = []
  for (let k = 0; k < weeks; k++) {
    const end = history.length - 7 * k
    if (end - 7 < 0) break
    const days = history.slice(end - 7, end)
    const ly = days.flatMap((day) =>
      day.lastYearOutbound == null ? [] : [day.lastYearOutbound],
    )
    out.unshift({
      end: days[days.length - 1].day,
      avg: round1(days.reduce((sum, day) => sum + day.outbound, 0) / 7),
      lastYear: ly.length
        ? round1(ly.reduce((a, b) => a + b, 0) / ly.length)
        : null,
    })
  }
  return out
}

const round1 = (value: number) => Math.round(value * 10) / 10
