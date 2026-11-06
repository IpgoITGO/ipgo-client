// "2026. 11. 7"처럼 월·일에 0이 없는 날짜도 날짜 순서대로 비교한다(글자 비교면 11/10이 11/7보다 앞선다).
const dateKey = (date: string) => {
  const m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(date)
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : Infinity
}

/** 예상 소진일이 가장 이른 상품. 날짜가 없으면("—") 맨 뒤 */
export function mostUrgent<T extends { stockoutDate: string }>(items: T[]) {
  return items.reduce<T | undefined>(
    (best, item) =>
      !best || dateKey(item.stockoutDate) < dateKey(best.stockoutDate)
        ? item
        : best,
    undefined,
  )
}
