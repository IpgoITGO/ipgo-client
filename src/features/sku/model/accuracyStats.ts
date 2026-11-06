export type AccuracyItem = {
  date: string
  outbound: number
  predictedOutbound: number
  covered: boolean
}

// 지난 예측 맞춰 보기: 서버 history 한 줄(예측·실제·품절 여부)만으로 셀러 말 숫자를 만든다.
export const MIN_ACCURACY_ITEMS = 3

export function accuracyStats(history: AccuracyItem[]) {
  const items = history.slice(-10)
  const n = items.length
  const sum = (pick: (item: AccuracyItem) => number) =>
    items.reduce((total, item) => total + pick(item), 0)
  const avgPredicted = n ? Math.round(sum((i) => i.predictedOutbound) / n) : 0
  const miss = n
    ? Math.round(sum((i) => Math.abs(i.predictedOutbound - i.outbound)) / n)
    : 0
  // 품절 난 때만 못 판 개수가 생긴다: 실제가 예측보다 넘친 만큼
  const lost = items.map((item) =>
    item.covered ? 0 : Math.max(0, item.outbound - item.predictedOutbound),
  )
  let worst: { item: AccuracyItem; over: number } | null = null
  for (const item of items) {
    const over = item.outbound - item.predictedOutbound
    if (over > 0 && (!worst || over > worst.over)) worst = { item, over }
  }
  return {
    items,
    total: n,
    coveredCount: items.filter((item) => item.covered).length,
    avgPredicted,
    miss,
    low: Math.max(0, avgPredicted - miss),
    high: avgPredicted + miss,
    lost,
    lostTotal: lost.reduce((a, b) => a + b, 0),
    lostTimes: lost.filter((v) => v > 0).length,
    worst,
  }
}
