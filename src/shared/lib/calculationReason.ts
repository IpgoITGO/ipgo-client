// 계산 엔진(ipgo-ai engine/calculate.py·forecast.py)이 주는 계산 불가 사유를 사람이 읽는 말로 바꾼다.
// 원래 서버 사유는 그대로 두고, 화면에 보여 줄 요약과 펼침용 설명만 만든다. 모르는 문장은 그대로 보여 준다.

const FIXED: [RegExp, string][] = [
  [
    /상품의 입고 설정이 없어요/,
    '입고 조건이 비어 있어요. 입고 조건에서 리드타임을 넣어 주세요.',
  ],
  [
    /기준일의 기말 재고 기록이 없어요/,
    '기준일 재고가 비어 있어요. 수불부 마지막 날 재고를 확인해 주세요.',
  ],
  [
    /기준일까지의 상품 기록이 없어요/,
    '기준일까지 이 상품의 수불부 기록이 없어요.',
  ],
  [
    /같은 날짜의 상품 기록이 중복/,
    '같은 날짜 기록이 두 번 있어요. 겹친 수불부를 확인해 주세요.',
  ],
  [
    /0 이상의 유한한 숫자여야/,
    '출고나 재고에 음수·빈 값이 있어요. 수불부를 확인해 주세요.',
  ],
  [
    /유효 관측일 판정이 없는 기록/,
    '계산 준비가 덜 된 기록이 있어요. 다시 계산해 주세요.',
  ],
]

export function calculationReason(reason: string) {
  const days = /유효 관측일\).*?(\d+)일로\s*(\d+)일/.exec(reason)
  if (days)
    return `판매 기록이 ${days[1]}일 쌓였어요. 계산하려면 최소 ${days[2]}일이 필요해요.`
  return FIXED.find(([pattern]) => pattern.test(reason))?.[1] ?? reason
}

const WINDOW = {
  P_H: '작년 같은 기간',
  C_90: '최근 90일',
  P_90: '작년 같은 90일',
}

// "자세한 계산 사유" 펼침용. 엔진이 두 계산 방식(A·B)의 사유를 "; "로 이어 보내면 한 줄씩 풀어 쓴다.
// 풀어 쓸 게 없으면 null(펼침을 보여 주지 않는다).
export function calculationReasonDetail(reason: string): string[] | null {
  const lines = reason.split(/;\s*/).map((part) => {
    const body = part.replace(/^[AB]:\s*/, '')
    const window =
      /(P_H|C_90|P_90) 구간\((\S+) ~ (\S+)\) 판매한 날이 (\d+)일로 (\d+)일/.exec(
        body,
      )
    if (window) {
      const [, name, start, end, have, need] = window
      return `${WINDOW[name as keyof typeof WINDOW]}(${start} ~ ${end}) 판매한 날 ${have}일 · ${need}일 필요`
    }
    const recent =
      /최근 (\d+)일 중 판매한 날\(유효 관측일\)이 (\d+)일로 (\d+)일/.exec(body)
    if (recent)
      return `최근 ${recent[1]}일 판매한 날 ${recent[2]}일 · ${recent[3]}일 필요`
    if (/작년 같은 90일 평균 출고가 0/.test(body))
      return '작년 같은 90일에 팔린 게 없어 작년과 비교할 수 없어요'
    return null
  })
  return lines.length > 1 && lines.every((line) => line !== null)
    ? (lines as string[])
    : null
}
