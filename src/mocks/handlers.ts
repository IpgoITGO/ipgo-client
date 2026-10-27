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
  http.get('/api/purchase-orders', () => {
    return HttpResponse.json([
      {
        id: 'order-1',
        productName: '덴탈껌 S 10입',
        barcode: '8800272421044',
        quantity: 60,
        arrivalDate: '2026-10-24',
        status: 'arrived',
      },
      {
        id: 'order-2',
        productName: '케어트릿 120g',
        barcode: '8800272420016',
        quantity: 120,
        arrivalDate: '2026-12-01',
        status: 'reflecting',
      },
      {
        id: 'order-3',
        productName: '동결건조 큐브 50g',
        barcode: '8800272421501',
        quantity: 30,
        arrivalDate: '2026-10-16',
        status: 'overdue',
      },
      {
        id: 'order-4',
        productName: '저키 스틱 100g',
        barcode: '8800272421273',
        quantity: 40,
        arrivalDate: null,
        status: 'no-date',
      },
    ])
  }),
  http.post('/api/purchase-orders', async ({ request }) => {
    const body = (await request.json()) as {
      productName: string
      barcode: string
      quantity: number
      arrivalDate: string
    }
    return HttpResponse.json(
      {
        id: 'order-new',
        productName: body.productName,
        barcode: body.barcode,
        quantity: body.quantity,
        arrivalDate: body.arrivalDate || null,
        status: body.arrivalDate ? 'reflecting' : 'no-date',
      },
      { status: 201 },
    )
  }),
  http.get('/api/dashboard', () => {
    return HttpResponse.json({
      baseDate: '2026. 10. 14',
      freshness: 'fresh',
      lastCalculatedAt: '10월 18일',
      summary: { needed: 6, safe: 22, unavailable: 2, excluded: 1 },
      neededItems: [
        {
          id: '8800272420016',
          name: '케어트릿 120g',
          barcode: '8800272420016',
          stockoutDate: '2026. 10. 22',
          leadTime: 5,
          quantity: 72,
          cost: 129600,
          risk: 8,
        },
        {
          id: '8800272421044',
          name: '덴탈껌 S 10입',
          barcode: '8800272421044',
          stockoutDate: '2026. 10. 25',
          leadTime: 5,
          quantity: 60,
          cost: 108000,
          risk: 5,
        },
        {
          id: '8800272420108',
          name: '케어트릿 8g 낱개',
          barcode: '8800272420108',
          stockoutDate: '2026. 10. 28',
          leadTime: 7,
          quantity: 96,
          cost: 28800,
          risk: 3,
        },
      ],
      unavailableItems: [
        { name: '신상품 트릿 30g', reason: '판매한 날이 7일보다 적어요.' },
      ],
      excludedItems: [
        {
          name: '덴탈껌 M 5입',
          reason: '재고 숫자가 맞지 않아 계산에서 제외했어요.',
        },
      ],
    })
  }),
]
