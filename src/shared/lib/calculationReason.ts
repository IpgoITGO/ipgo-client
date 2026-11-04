// 원래 서버 사유는 유지하고, 사용자에게 보여 줄 요약만 만든다.
export function calculationReason(reason: string) {
  const days = /유효 관측일\).*?(\d+)일로\s*(\d+)일/.exec(reason)
  return days
    ? `판매 기록이 ${days[1]}일 쌓였어요. 계산하려면 최소 ${days[2]}일이 필요해요.`
    : reason
}
