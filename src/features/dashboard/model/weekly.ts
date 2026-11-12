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

// 판매 급증 카드 수량: 최근 하루 판매로 다음 입고까지(리드타임 + 입고 주기) 버틸 양을 입고 단위로 올림. 설정이 비면 없음
export function surgeQuantity(
  recentDaily: number,
  leadTime: number | null | undefined,
  reviewCycle: number | null | undefined,
  unit: number,
) {
  if (leadTime == null || reviewCycle == null) return null
  const step = Math.max(1, unit)
  return (
    Math.ceil(Math.ceil(recentDaily * (leadTime + reviewCycle)) / step) * step
  )
}
