import { http, HttpResponse } from 'msw'

import type { ExpiryLot } from '../model/expiryApi'

// ipgo-server#169와 같은 모양의 가짜 응답. 날짜는 오늘 기준으로 움직인다
function fromToday(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// 임박 기준(가짜 서버는 계정 구분 없이 하나). 테스트마다 처음 값으로 되돌린다
let imminentDays = 30
export function resetExpiryMock() {
  imminentDays = 30
}

function lot(
  productId: number,
  skuName: string,
  skuBarcode: string,
  daysLeft: number | null,
  remainingQty: number,
): ExpiryLot {
  return {
    productId,
    skuBarcode,
    skuName,
    receivedOn: fromToday(-60),
    expiryDate: daysLeft == null ? null : fromToday(daysLeft),
    daysLeft,
    remainingQty,
    status:
      daysLeft == null
        ? 'UNKNOWN'
        : daysLeft < 0
          ? 'EXPIRED'
          : daysLeft <= imminentDays
            ? 'IMMINENT'
            : 'OK',
  }
}

export const expiryHandlers = [
  http.get('/api/settings/expiry', () => HttpResponse.json({ imminentDays })),
  http.put('/api/settings/expiry', async ({ request }) => {
    const body = (await request.json()) as { imminentDays?: unknown }
    const days = body.imminentDays
    if (
      typeof days !== 'number' ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > 365
    ) {
      return HttpResponse.json(
        {
          code: 'INVALID_INPUT',
          message: '1~365일로 넣어 주세요.',
          details: { field: 'imminentDays' },
        },
        { status: 400 },
      )
    }
    imminentDays = days
    return HttpResponse.json({ imminentDays })
  }),
  http.get('/api/expiry', () => {
    const items = [
      lot(7, '연어 져키 80g', '8800272421200', -2, 6),
      lot(1, '케어트릿 120g', '8800272420016', 12, 18),
      lot(3, '덴탈껌 S 10입', '8800272421044', 25, 40),
      lot(1, '케어트릿 120g', '8800272420016', 95, 30),
      lot(21, '치킨 져키 70g', '8800272421400', 48, 22),
      lot(4, '동결건조 큐브 50g', '8800272421501', 160, 12),
      lot(8, '오리 큐브 100g', '8800272421300', null, 9),
    ]
    const count = (status: ExpiryLot['status']) =>
      items.filter((item) => item.status === status).length
    return HttpResponse.json({
      asOfDate: fromToday(-1),
      imminentDays,
      summary: {
        expired: count('EXPIRED'),
        imminent: count('IMMINENT'),
        ok: count('OK'),
        unknown: count('UNKNOWN'),
      },
      items: items.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)),
    })
  }),
]
