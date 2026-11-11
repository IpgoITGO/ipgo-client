// 대시보드에서 고른 상품을 거래처에 넘길 발주 목록(CSV)으로. 엑셀이 한글을 바로 읽도록 BOM을 붙인다.
export type OrderLine = {
  name: string
  barcode: string
  /** 권장 입고량. 아직 괜찮은 상품은 권장량이 없어 null(빈칸) */
  quantity: number | null
  /** 상세에서 내가 정한 입고량. 없으면 권장대로 */
  planned?: number | null
  /** 주문 수량 기준 사입비. 단가를 모르면 null(빈칸) */
  cost: number | null
  stockoutDate: string
}

// 우리가 직접 만든 칸(수식 막기를 거치지 않음)
type Raw = { raw: string }

// 숫자만 있는 바코드는 엑셀이 숫자로 읽어 8.8E+12처럼 바꾸고 끝자리를 잃는다 → ="…"로 글자로 읽게(#247)
const barcodeCell = (barcode: string): string | Raw =>
  /^[0-9]+$/.test(barcode) ? { raw: `"=""${barcode}"""` } : barcode

const cell = (value: string | number | Raw) => {
  if (typeof value === 'object') return value.raw
  const text = String(value)
  // 외부에서 온 상품명·바코드를 스프레드시트 수식으로 실행하지 않는다.
  // 숫자 합계는 숫자로 유지하고, 공백 뒤 수식 시작 문자와 제어 문자도 처리한다.
  const safeText =
    typeof value === 'string' && /^(?:\s*[=+@-]|[\t\r\n])/.test(text)
      ? `'${text}`
      : text
  return /[",\r\n]/.test(safeText)
    ? `"${safeText.replaceAll('"', '""')}"`
    : safeText
}

export function toOrderCsv(lines: OrderLine[]) {
  const rows = [
    [
      '상품명',
      '바코드',
      '권장 입고량(개)',
      '내 입고량(개)',
      '주문 수량(개)',
      '사입비(원)',
      '예상 소진일',
    ],
    ...lines.map((line) => [
      line.name,
      barcodeCell(line.barcode),
      line.quantity ?? '',
      line.planned ?? '',
      orderQty(line) ?? '',
      line.cost ?? '',
      line.stockoutDate,
    ]),
    [
      '합계',
      '',
      sum(lines, 'quantity'),
      lines.some((line) => line.planned != null)
        ? lines.reduce((total, line) => total + (line.planned ?? 0), 0)
        : '',
      lines.reduce((total, line) => total + (orderQty(line) ?? 0), 0),
      sum(lines, 'cost'),
      '',
    ],
  ]
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

const orderQty = (line: OrderLine) => line.planned ?? line.quantity

function sum(lines: OrderLine[], key: 'quantity' | 'cost') {
  return lines.reduce((total, line) => total + (line[key] ?? 0), 0)
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
