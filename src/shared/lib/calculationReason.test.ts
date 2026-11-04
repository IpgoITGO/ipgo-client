import { expect, it } from 'vitest'
import { calculationReason } from './calculationReason'
it('기록 부족을 최소 필요 일수로 설명하고 다른 오류를 기록 부족으로 바꾸지 않는다', () => {
  expect(
    calculationReason(
      'B: 최근 28일 중 판매한 날(유효 관측일)이 5일로 7일보다 적어요; A: P_H 구간 없음',
    ),
  ).toBe('판매 기록이 5일 쌓였어요. 계산하려면 최소 7일이 필요해요.')
  expect(calculationReason('재고 검산 불일치')).toBe('재고 검산 불일치')
})
