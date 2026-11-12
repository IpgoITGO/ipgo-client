import { describe, expect, it } from 'vitest'

import { ApiError } from '../../../shared/api/client'
import { billingErrorText } from './billingApi'

describe('결제 오류 안내', () => {
  it('자동결제 차단은 일반결제의 자동 갱신 없음과 별도 환불 경로를 안내한다', () => {
    expect(
      billingErrorText(
        new ApiError(
          409,
          'AUTOMATIC_PAYMENT_DISABLED',
          '현재 결제 상태를 확인한 뒤 다시 요청해주세요.',
        ),
      ),
    ).toBe(
      '일반결제는 자동 갱신되지 않아요. 결제를 취소하려면 결제 내역의 ‘결제 취소·환불’을 이용해 주세요.',
    )
  })

  it('다른 서버 오류의 설명은 그대로 유지한다', () => {
    expect(
      billingErrorText(
        new ApiError(
          409,
          'ONLY_CURRENT_PAYMENT_REFUNDABLE',
          '최신 결제만 취소할 수 있어요.',
        ),
      ),
    ).toBe('최신 결제만 취소할 수 있어요.')
  })
})
