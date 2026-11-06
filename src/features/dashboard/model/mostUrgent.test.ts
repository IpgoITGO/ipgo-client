import { expect, it } from 'vitest'

import { mostUrgent } from './mostUrgent'

it('월·일에 0이 없는 날짜도 날짜 순서로 가장 급한 상품을 고른다', () => {
  const items = [
    { name: '늦은 상품', stockoutDate: '2026. 11. 10' },
    { name: '급한 상품', stockoutDate: '2026. 11. 7' },
    { name: '날짜 없음', stockoutDate: '—' },
  ]
  expect(mostUrgent(items)?.name).toBe('급한 상품')
  expect(mostUrgent([])).toBeUndefined()
})
