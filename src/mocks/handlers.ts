import { http, HttpResponse } from 'msw'

import { authHandlers } from '../auth/mocks/handlers'

// 연동 명세 U3 예시. 2026-09는 이미 올린 기간이라 다시 올리면 덮어쓰기 확인이 뜬다.
const mockUploadPeriods = {
  items: [
    {
      period: '2026-09',
      uploadId: 12,
      fileName: '2026-09.xlsx',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      uploadedAt: '2026-10-15T10:02:00+09:00',
      status: 'DONE',
    },
  ],
  latestUploadId: 12,
}

export const handlers = [
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok' })
  }),
  ...authHandlers,
  http.get('/api/uploads/periods', () => {
    return HttpResponse.json(mockUploadPeriods)
  }),
  http.post('/api/uploads', async ({ request }) => {
    const form = await request.formData()
    const overwrite = form.get('overwrite') === 'true'
    const names = form
      .getAll('files')
      .map((file) => (typeof file === 'string' ? file : file.name))
    const periods = names.map((name) => ({
      match: /^(\d{4})-(0[1-9]|1[0-2])\.xlsx$/i.exec(name),
      name,
    }))

    const invalid = periods.find((item) => !item.match)
    if (invalid) {
      return HttpResponse.json(
        {
          code: 'UPLOAD_INVALID_FORMAT',
          message: 'XLSX 파일이 아니거나 파일명에서 연·월을 읽을 수 없어요.',
          details: { fileName: invalid.name },
        },
        { status: 400 },
      )
    }

    const existing = mockUploadPeriods.items.find((item) =>
      periods.some((p) => `${p.match?.[1]}-${p.match?.[2]}` === item.period),
    )
    if (existing && !overwrite) {
      return HttpResponse.json(
        {
          code: 'UPLOAD_DUPLICATE',
          message: '이미 올린 기간입니다',
          details: { existing },
        },
        { status: 409 },
      )
    }

    return HttpResponse.json(
      { uploadId: 15, status: 'PROCESSING' },
      { status: 202 },
    )
  }),
  http.get('/api/uploads/:uploadId', () => {
    return HttpResponse.json({
      uploadId: 15,
      status: 'DONE',
      periodStart: '2026-09-01',
      periodEnd: '2026-10-14',
      asOfDate: '2026-10-14',
      validation: {
        checkedSkuCount: 159,
        targetSkuCount: 158,
        excludedSkus: [
          {
            productId: 108,
            skuBarcode: '8800272421082',
            skuName: '덴탈껌 M 5입',
            date: '2026-09-12',
            reason: '전날 재고 + 입고 − 출고 ± 조정이 당일 재고와 3개 달라요',
          },
        ],
      },
      matchedReceipts: [
        {
          receiptId: 5,
          skuName: '덴탈껌 S 10입',
          quantity: 60,
          receivedOn: '2026-10-20',
          status: 'RECEIVED',
        },
      ],
      runId: 31,
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
  http.get('/api/skus/:skuId', ({ params }) => {
    if (params.skuId === 'new-product') {
      return HttpResponse.json({
        id: 'new-product',
        name: '신상품 트릿 30g',
        barcode: '8800272421999',
        fulfillment: '서울 풀필먼트',
        status: 'unavailable',
        unavailableReason: '판매한 날이 7일보다 적어요.',
        recommendation: { quantity: 0, cost: 0, expectedStockoutDate: '-' },
        history: [],
        calculation: {
          formulaA: 0,
          formulaB: 0,
          selectedFormula: 'A',
          multiplier: 1,
          coverDays: 0,
          startingInventory: 0,
          startingInventoryEstimated: false,
          existingOrders: 0,
          inboundUnit: 1,
          rawQuantity: 0,
        },
        accuracy: {
          grade: 'low',
          score: 0,
          survivedRatio: 0,
          description: '비교할 예측 기록이 없어요.',
        },
      })
    }

    const isReference = params.skuId === 'reference-product'
    const isLowAccuracy =
      params.skuId === 'low-accuracy' || params.skuId === 'reference-product'

    return HttpResponse.json({
      id: String(params.skuId),
      name: '케어트릿 120g',
      barcode: '8800272420016',
      fulfillment: '서울 풀필먼트',
      status: isReference ? 'reference' : 'ready',
      recommendation: {
        quantity: 72,
        cost: 129600,
        expectedStockoutDate: '2026. 10. 22',
      },
      history: [
        { date: '9월 1일', inventory: 45, outbound: 4, predictedOutbound: 5 },
        { date: '9월 8일', inventory: 31, outbound: 7, predictedOutbound: 6 },
        { date: '9월 15일', inventory: 18, outbound: 5, predictedOutbound: 7 },
        { date: '9월 22일', inventory: 0, outbound: 2, predictedOutbound: 6 },
        { date: '9월 29일', inventory: 28, outbound: 8, predictedOutbound: 7 },
        { date: '10월 6일', inventory: 14, outbound: 6, predictedOutbound: 7 },
        { date: '10월 14일', inventory: 4, outbound: 9, predictedOutbound: 8 },
      ],
      calculation: {
        formulaA: 67,
        formulaB: 69,
        selectedFormula: 'B',
        multiplier: 1.15,
        coverDays: 34,
        startingInventory: 4,
        startingInventoryEstimated: isReference,
        existingOrders: 12,
        inboundUnit: 12,
        rawQuantity: 68.7,
      },
      accuracy: {
        grade: isLowAccuracy ? 'low' : 'high',
        score: isLowAccuracy ? 48 : 87,
        survivedRatio: isLowAccuracy ? 54 : 92,
        description: isLowAccuracy
          ? '관측 기간이 짧아 실제 출고와 차이가 클 수 있어요.'
          : '최근 4주 예측이 실제 출고 흐름과 비슷했어요.',
      },
    })
  }),
  http.get('/api/skus/:skuId/scenarios', ({ params }) => {
    const recommendedQuantity = params.skuId === 'zero-recommendation' ? 0 : 72
    return HttpResponse.json({
      recommendedQuantity,
      scenarios: [
        {
          id: '80',
          label: '권장량의 80%',
          quantity: 60,
          expectedStockoutDate: '2026. 11. 18',
          remainingAtNextInbound: 14,
          preArrivalRisk: 18,
          postArrivalRisk: 9,
          estimated: true,
          sampleSize: 44,
        },
        {
          id: '100',
          label: '권장량 100%',
          quantity: 72,
          expectedStockoutDate: '2026. 11. 27',
          remainingAtNextInbound: 26,
          preArrivalRisk: 8,
          postArrivalRisk: 3,
          estimated: true,
          sampleSize: 44,
        },
        {
          id: '120',
          label: '권장량의 120%',
          quantity: 84,
          expectedStockoutDate: '2026. 12. 5',
          remainingAtNextInbound: 38,
          preArrivalRisk: null,
          postArrivalRisk: null,
          estimated: true,
          sampleSize: 5,
        },
      ],
    })
  }),
  http.post('/api/skus/:skuId/scenarios', async ({ request }) => {
    const body = (await request.json()) as { quantity: number }
    return HttpResponse.json({
      id: 'custom',
      label: '직접 입력',
      quantity: body.quantity,
      expectedStockoutDate: '2026. 12. 10',
      remainingAtNextInbound: body.quantity - 46,
      preArrivalRisk: 7,
      postArrivalRisk: 2,
      estimated: true,
      sampleSize: 44,
    })
  }),
  http.get('/api/skus/:skuId/insight', ({ params }) => {
    if (params.skuId === 'ai-fallback') {
      return HttpResponse.json({
        source: 'fallback',
        message:
          '권장 입고량 72개를 기준으로 도착 전 품절 위험과 다음 입고 시점 재고를 함께 확인해 주세요.',
      })
    }

    return HttpResponse.json({
      source: 'ai',
      message:
        '권장량 72개를 입고하면 도착 전 품절 위험은 8%, 도착 후 위험은 3%로 낮아져요. 60개보다 다음 입고 시점 재고가 12개 더 남아요.',
    })
  }),
]
