import { expect, it } from 'vitest'

import { orderFileName, toOrderCsv } from './orderCsv'

it('고른 상품을 합계 줄까지 붙여 CSV로 만든다', () => {
  const csv = toOrderCsv([
    {
      name: '케어트릿 120g',
      barcode: '8800272420016',
      quantity: 72,
      cost: 129600,
      stockoutDate: '2026. 11. 2',
    },
    {
      name: '연어 "져키", 80g',
      barcode: '8800272421200',
      quantity: 40,
      cost: 52000,
      stockoutDate: '2026. 11. 4',
    },
  ])
  expect(csv.startsWith('﻿상품명,바코드')).toBe(true)
  expect(csv).toContain('"연어 ""져키"", 80g",8800272421200,40,52000')
  expect(csv.endsWith('합계,,112,181600,')).toBe(true)
})

it('파일 이름에 날짜를 붙인다', () => {
  expect(orderFileName(new Date(2026, 10, 5))).toBe('발주목록_20261105.csv')
})
