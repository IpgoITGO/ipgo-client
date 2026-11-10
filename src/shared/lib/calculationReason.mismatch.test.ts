import { expect, it } from 'vitest'

import { calculationReason, inventoryMismatch } from './calculationReason'

it('검산 문장을 날짜 없이도 셀러 말로 풀고, 기초·기말 같은 계산식 말은 안 남긴다', () => {
  const reason =
    '기초 34 + 입고 0 − 출고 3 + 조정 0 = 31개인데 기록된 기말은 34개예요'
  expect(inventoryMismatch(reason)).toEqual({
    diff: 3,
    explain:
      '34개로 시작해 3개 나가서 31개가 남아야 하는데, 수불부에는 34개로 적혀 있어요.',
    todo: '그날 줄을 고치거나, 재고 조사로 맞춘 거면 조정 칸에 +3을 적어 다시 올려 주세요.',
  })
  expect(calculationReason(reason)).not.toMatch(/기초|기말/)
  expect(
    inventoryMismatch('최근 28일 중 판매한 날이 5일로 7일보다 적어요'),
  ).toBeNull()
})
