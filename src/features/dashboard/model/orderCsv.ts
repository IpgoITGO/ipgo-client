// 대시보드에서 고른 상품을 거래처에 넘길 발주 목록(CSV)으로. 엑셀이 한글을 바로 읽도록 BOM을 붙인다.
export type OrderLine = {
  name: string
  barcode: string
  quantity: number
  cost: number
  stockoutDate: string
}

const cell = (value: string | number) => {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toOrderCsv(lines: OrderLine[]) {
  const rows = [
    ['상품명', '바코드', '권장 입고량(개)', '사입비(원)', '예상 소진일'],
    ...lines.map((line) => [
      line.name,
      line.barcode,
      line.quantity,
      line.cost,
      line.stockoutDate,
    ]),
    ['합계', '', sum(lines, 'quantity'), sum(lines, 'cost'), ''],
  ]
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

function sum(lines: OrderLine[], key: 'quantity' | 'cost') {
  return lines.reduce((total, line) => total + line[key], 0)
}

// "발주목록_20261105.csv"
export function orderFileName(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `발주목록_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.csv`
}

export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/csv;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
