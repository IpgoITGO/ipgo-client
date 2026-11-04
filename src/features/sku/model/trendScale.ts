// 세로 눈금 간격: 1·2·5 × 10의 거듭제곱으로 넓혀 눈금을 대략 5~6개로 제한한다(재고가 10만 개여도 같다).
export function niceStep(max: number) {
  const raw = Math.max(max, 1) / 5
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * power).find((v) => v >= raw) ?? raw
  return Math.max(10, step)
}

// 큰 숫자는 "2만"처럼 짧게 써서 눈금 글자가 겹치지 않게 한다.
export function tickText(value: number) {
  return value >= 10000
    ? `${Math.round((value / 10000) * 10) / 10}만`
    : value.toLocaleString()
}
