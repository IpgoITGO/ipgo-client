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
  expect(csv).toContain(
    '상품명,바코드,권장 입고량(개),내 입고량(개),주문 수량(개),사입비(원),예상 소진일',
  )
  // 내 입고량이 없으면 칸은 비우고 주문 수량은 권장대로
  expect(csv).toContain(
    '"연어 ""져키"", 80g","=""8800272421200""",40,,40,52000',
  )
  expect(csv.endsWith('합계,,112,,112,181600,')).toBe(true)
})

it('내 입고량이 있으면 주문 수량은 그 수량이다', () => {
  const csv = toOrderCsv([
    {
      name: '케어트릿',
      barcode: '1',
      quantity: 72,
      planned: 60,
      cost: 108000,
      stockoutDate: '2026. 11. 2',
    },
  ])
  expect(csv).toContain('케어트릿,"=""1""",72,60,60,108000')
})

it('파일 이름에 날짜를 붙인다', () => {
  expect(orderFileName(new Date(2026, 10, 5))).toBe('발주목록_20261105.csv')
})

it.each([
  '=1+1',
  '+1+1',
  '-1+1',
  '@SUM(1)',
  '  =1+1',
  '\t=1+1',
  '\r=1+1',
  '\n=1+1',
])('문자열 %j가 수식으로 해석되지 않게 내보낸다', (value) => {
  const csv = toOrderCsv([
    { name: value, barcode: value, quantity: 1, cost: 10, stockoutDate: '—' },
  ])
  const escaped = `'${value}`.replaceAll('"', '""')
  const expected = /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped
  expect(csv).toContain(`\r\n${expected},${expected},1,,1,10,—\r\n`)
})

it('CR만 있는 셀도 감싸고 실제 숫자 값은 문자열 방어를 적용하지 않는다', () => {
  const csv = toOrderCsv([
    {
      name: '상품\r이름',
      barcode: '8800000000001',
      quantity: -1,
      cost: -10,
      stockoutDate: '—',
    },
  ])
  expect(csv).toContain('"상품\r이름","=""8800000000001""",-1,,-1,-10,—')
})
