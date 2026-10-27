import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok' })
  }),
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string }

    if (body.email !== 'seller@a.com' || body.password !== 'pass1234') {
      return HttpResponse.json(
        {
          code: 'INVALID_CREDENTIALS',
          message: '이메일 또는 비밀번호가 맞지 않아요.',
        },
        { status: 401 },
      )
    }

    return HttpResponse.json({
      user: {
        email: body.email,
      },
    })
  }),
  http.post('/api/uploads', () => {
    return HttpResponse.json(
      { uploadId: 'upload-20261027', status: 'processing' },
      { status: 202 },
    )
  }),
  http.get('/api/uploads/:uploadId', () => {
    return HttpResponse.json({
      status: 'completed',
      period: '2026. 9. 1 ~ 10. 14',
      referenceDate: '2026. 10. 14',
      totalCount: 159,
      excludedCount: 1,
      calculatedCount: 158,
      validationIssues: [
        {
          name: '덴탈껌 M 5입',
          barcode: '8800272421082',
          date: '2026. 9. 12',
          reason: '전날 재고 + 입고 − 출고 + 조정이 당일 재고와 3개 달라요',
        },
      ],
      orderedItems: [
        { name: '덴탈껌 S 10입', quantity: 60, arrivalDate: '10월 20일' },
      ],
    })
  }),
  http.get('/api/settings/inbound', () => {
    return HttpResponse.json({
      defaults: { leadTime: 5, orderCycle: 29, inboundUnit: 1 },
      products: [
        {
          name: '케어트릿 120g',
          barcode: '8800272420016',
          leadTime: 5,
          orderCycle: 29,
          inboundUnit: 12,
          cost: 1800,
          overridden: true,
        },
        {
          name: '케어트릿 8g 낱개',
          barcode: '8800272420108',
          leadTime: 7,
          orderCycle: 29,
          inboundUnit: 1,
          cost: 300,
          overridden: true,
        },
        {
          name: '덴탈껌 S 10입',
          barcode: '8800272421044',
          leadTime: 5,
          orderCycle: 29,
          inboundUnit: 1,
          cost: 1800,
          overridden: false,
        },
      ],
    })
  }),
  http.put('/api/settings/inbound', () => HttpResponse.json({ saved: true })),
]
