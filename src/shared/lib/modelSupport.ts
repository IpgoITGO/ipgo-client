export type ModelSupport = {
  method: 'LGBM19'
  leadTimeDays: number
  reviewCycleDays: number
}

export type CurrentSettings = {
  leadTimeDays: number | null
  reviewCycleDays: number | null
  orderUnitQty: number | null
}

export function unsupportedModelPeriod(
  support: ModelSupport | null | undefined,
  leadTime: number | null | undefined,
  orderCycle: number | null | undefined,
) {
  return (
    support?.method === 'LGBM19' &&
    (leadTime !== support.leadTimeDays ||
      orderCycle !== support.reviewCycleDays)
  )
}

// 구버전 서버도 전달하는 모델 입력 제한 사유. 다른 입력·모델 장애 사유는 섞지 않는다.
export function isUnsupportedModelPeriod(reason: string) {
  return reason.includes(
    '이 모델은 배송 5일·발주 주기 14일·배수 1 조건에서만 계산해요',
  )
}
