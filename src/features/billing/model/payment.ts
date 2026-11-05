import type { PayMethod, PlanId } from './billing'

export type PayResult =
  | { status: 'paid' }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string }

// 결제사가 돌려주는 사유를 우리 말로. 모르는 사유는 한 문장으로 묶는다.
const REASONS: Record<string, string> = {
  LIMIT_EXCEEDED: '카드 한도가 부족해요',
  INVALID_CARD: '카드 정보가 맞지 않아요',
  EXPIRED_CARD: '유효 기간이 지난 카드예요',
  NETWORK: '결제사와 연결이 끊겼어요',
}

export function reasonText(code: string) {
  return REASONS[code] ?? '결제사에서 결제를 거절했어요'
}

// 결제창 열기 → 승인 확인. 승인 확인은 서버가 비밀 키로 하는 단계라 지금은 모의로 성공을 돌려준다.
// ponytail: 포트원 상점 ID·채널 키를 받으면 여기서 @portone/browser-sdk의 requestPayment를 부르고,
// 서버 승인 API가 생기면 그 응답으로 바꾼다(#186). 화면은 이 함수의 결과만 본다.
export async function requestPayment(
  plan: PlanId,
  method: PayMethod,
): Promise<PayResult> {
  void plan
  void method
  await new Promise((resolve) => setTimeout(resolve, 700))
  return { status: 'paid' }
}
