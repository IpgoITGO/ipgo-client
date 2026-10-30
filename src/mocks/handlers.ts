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

// 이번에 올린 파일 내용 → 기간·기존 업로드. 같은 내용을 다른 기간으로 다시 올리는지 본다.
let uploadedContents = new Map<
  string,
  {
    period: string
    existing: { uploadId: number; originalName: string; uploadedAt: string }
  }
>()

// 테스트 사이에 올린 파일 기록을 지운다.
export function resetUploadMock() {
  uploadedContents = new Map()
}

// 상품(P1). 서버는 수불부 정제 결과로 상품을 자동 등록하고, 업로드에 안 나와도 끄지 않는다.
// 사용 여부(isActive)는 셀러가 P2로 직접 바꾼다. 마지막 하나는 판매를 접어 꺼 둔 상품.
type MockProduct = {
  productId: number
  skuBarcode: string
  skuName: string
  unitCost: number | null
  isActive: boolean
  settings: {
    leadTimeDays: number
    reviewCycleDays: number
    orderUnitQty: number
  }
  overridden: string[]
}
const defaultSettings = {
  leadTimeDays: 5,
  reviewCycleDays: 29,
  orderUnitQty: 1,
}
const seedProducts: MockProduct[] = [
  {
    productId: 1,
    skuBarcode: '8800272420016',
    skuName: '케어트릿 120g',
    unitCost: 1800,
    isActive: true,
    settings: { ...defaultSettings, orderUnitQty: 12 },
    overridden: ['orderUnitQty'],
  },
  {
    productId: 2,
    skuBarcode: '8800272420108',
    skuName: '케어트릿 8g 낱개',
    unitCost: 300,
    isActive: true,
    settings: { ...defaultSettings, leadTimeDays: 7 },
    overridden: ['leadTimeDays'],
  },
  {
    productId: 3,
    skuBarcode: '8800272421044',
    skuName: '덴탈껌 S 10입',
    unitCost: 1800,
    isActive: true,
    settings: { ...defaultSettings },
    overridden: [],
  },
  {
    productId: 4,
    skuBarcode: '8800272421501',
    skuName: '동결건조 큐브 50g',
    unitCost: 2500,
    isActive: true,
    settings: { ...defaultSettings },
    overridden: [],
  },
  {
    productId: 5,
    skuBarcode: '8800272421273',
    skuName: '저키 스틱 100g',
    unitCost: 2200,
    isActive: true,
    settings: { ...defaultSettings },
    overridden: [],
  },
  {
    productId: 6,
    skuBarcode: '8800272429999',
    skuName: '단종 간식 30g',
    unitCost: 900,
    isActive: false,
    settings: { ...defaultSettings },
    overridden: [],
  },
]
let mockProducts = seedProducts.map((item) => ({
  ...item,
  settings: { ...item.settings },
}))
// 창고 기본 입고 조건(S1·S2). 저장하기 전에는 confirmed: false와 제안값.
let defaults = {
  confirmed: false,
  ...defaultSettings,
  reviewCycleSource: 'ESTIMATED',
}

// 기존 발주(R1~R3). 등록·수정·취소가 목록에 남도록 메모리에 둔다.
type MockReceipt = {
  receiptId: number
  productId: number
  skuName: string
  quantity: number
  expectedOn: string | null
  receivedOn: string | null
  status: 'PENDING' | 'NO_DATE' | 'RECEIVED' | 'OVERDUE'
  reflected: boolean
}
const seedReceipts: MockReceipt[] = [
  {
    receiptId: 1,
    productId: 3,
    skuName: '덴탈껌 S 10입',
    quantity: 60,
    expectedOn: '2026-10-24',
    receivedOn: '2026-10-24',
    status: 'RECEIVED',
    reflected: false,
  },
  {
    receiptId: 2,
    productId: 1,
    skuName: '케어트릿 120g',
    quantity: 120,
    expectedOn: '2026-12-01',
    receivedOn: null,
    status: 'PENDING',
    reflected: true,
  },
  {
    receiptId: 3,
    productId: 4,
    skuName: '동결건조 큐브 50g',
    quantity: 30,
    expectedOn: '2026-10-16',
    receivedOn: null,
    status: 'OVERDUE',
    reflected: true,
  },
  {
    receiptId: 4,
    productId: 5,
    skuName: '저키 스틱 100g',
    quantity: 40,
    expectedOn: null,
    receivedOn: null,
    status: 'NO_DATE',
    reflected: false,
  },
]
let receipts = seedReceipts.map((item) => ({ ...item }))

// 테스트 사이에 발주 목록을 처음으로 돌린다.
export function resetPlannedReceiptsMock() {
  receipts = seedReceipts.map((item) => ({ ...item }))
  mockProducts = seedProducts.map((item) => ({
    ...item,
    settings: { ...item.settings },
  }))
  defaults = {
    confirmed: false,
    ...defaultSettings,
    reviewCycleSource: 'ESTIMATED',
  }
}

// 서버처럼 수량은 1 이상 정수, 틀리면 400과 칸 이름
function invalidField(field: string) {
  return HttpResponse.json(
    {
      code: 'INVALID_INPUT',
      message: '입력값을 확인해주세요.',
      details: { field },
    },
    { status: 400 },
  )
}
const isQuantity = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

// 오늘에서 n일 뒤(음수면 앞) 날짜를 서버 모양 "2026-10-29"로
function isoFromToday(n: number) {
  const date = new Date()
  date.setDate(date.getDate() + n)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
    // 서버와 같이 한 요청에 파일 1개(file 칸)만 받는다.
    const file = form.get('file')
    if (!file || typeof file === 'string' || form.getAll('file').length > 1) {
      return HttpResponse.json(
        { code: 'INVALID_INPUT', message: '파일을 하나 골라 주세요.' },
        { status: 400 },
      )
    }
    const names = [file.name]
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

    const period = `${periods[0].match?.[1]}-${periods[0].match?.[2]}`
    // 서버처럼 내용이 똑같은 파일을 다른 기간 이름으로 올리면 덮어쓰기여도 막는다(server PR #30).
    const content = await file.text()
    const sameFile = uploadedContents.get(content)
    if (sameFile && sameFile.period !== period) {
      return HttpResponse.json(
        {
          code: 'UPLOAD_DUPLICATE',
          message: '이미 올린 파일입니다.',
          details: { reason: 'SAME_FILE', existing: sameFile.existing },
        },
        { status: 409 },
      )
    }

    const existing = mockUploadPeriods.items.find(
      (item) => item.period === period,
    )
    if (existing && !overwrite) {
      return HttpResponse.json(
        {
          code: 'UPLOAD_DUPLICATE',
          message: '이미 올린 기간입니다',
          details: { reason: 'SAME_PERIOD', existing },
        },
        { status: 409 },
      )
    }

    uploadedContents.set(content, {
      period,
      existing: {
        uploadId: 15,
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    })
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
  // P1 상품 목록·검색 (상품명 대소문자 무시 · 바코드 일부). 입고 조건·바꾼 칸(overridden)도 함께.
  http.get('/api/products', ({ request }) => {
    const params = new URL(request.url).searchParams
    const query = (params.get('query') ?? '').toLowerCase()
    const page = Number(params.get('page') ?? 0)
    const size = Number(params.get('size') ?? 20)
    const matched = mockProducts.filter(
      (item) =>
        item.skuName.toLowerCase().includes(query) ||
        item.skuBarcode.includes(query),
    )
    return HttpResponse.json({
      items: matched.slice(page * size, (page + 1) * size),
      total: matched.length,
      page,
      size,
    })
  }),
  // P2 상품명·원가·사용 여부 수정: 보낸 칸만 바뀐다
  http.patch('/api/products/:productId', async ({ params, request }) => {
    const product = mockProducts.find(
      (item) => item.productId === Number(params.productId),
    )
    if (!product) {
      return HttpResponse.json(
        { code: 'NOT_FOUND', message: '상품을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    const body = (await request.json()) as {
      skuName?: string
      unitCost?: number
      isActive?: boolean
    }
    if (body.skuName !== undefined) product.skuName = body.skuName
    if (body.unitCost !== undefined) product.unitCost = body.unitCost
    if (body.isActive !== undefined) product.isActive = body.isActive
    return HttpResponse.json(product)
  }),
  // S1 기본값 조회
  http.get('/api/replenishment-settings', () => HttpResponse.json(defaults)),
  // S2 기본값 저장: 세 칸 모두 필수, 1 이상 정수. recalculate면 계산을 시작한다
  http.put('/api/replenishment-settings', async ({ request }) => {
    const body = (await request.json()) as Record<string, number | boolean>
    for (const field of ['leadTimeDays', 'reviewCycleDays', 'orderUnitQty']) {
      const value = body[field]
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        return invalidField(field)
      }
    }
    defaults = {
      confirmed: true,
      leadTimeDays: body.leadTimeDays as number,
      reviewCycleDays: body.reviewCycleDays as number,
      orderUnitQty: body.orderUnitQty as number,
      reviewCycleSource: 'DEFAULT',
    }
    return HttpResponse.json({
      saved: true,
      runId: body.recalculate ? 31 : null,
    })
  }),
  // S3 상품별 입고 조건: 세 칸을 보낸 값으로 모두 바꾸고, unitCost는 보낸 경우에만
  http.put(
    '/api/products/:productId/replenishment-settings',
    async ({ params, request }) => {
      const product = mockProducts.find(
        (item) => item.productId === Number(params.productId),
      )
      if (!product) {
        return HttpResponse.json(
          { code: 'NOT_FOUND', message: '상품을 찾을 수 없습니다.' },
          { status: 404 },
        )
      }
      const body = (await request.json()) as Record<string, number | undefined>
      for (const field of ['leadTimeDays', 'reviewCycleDays', 'orderUnitQty']) {
        const value = body[field]
        if (
          typeof value !== 'number' ||
          !Number.isInteger(value) ||
          value < 1
        ) {
          return invalidField(field)
        }
      }
      product.settings = {
        leadTimeDays: body.leadTimeDays as number,
        reviewCycleDays: body.reviewCycleDays as number,
        orderUnitQty: body.orderUnitQty as number,
      }
      product.overridden = Object.keys(product.settings).filter(
        (key) =>
          product.settings[key as keyof typeof product.settings] !==
          defaults[key as keyof typeof product.settings],
      )
      if (body.unitCost !== undefined) product.unitCost = body.unitCost
      return HttpResponse.json({ saved: true, runId: null })
    },
  ),
  // R1 목록: 도착 예정일 빠른 순, 예정일 없는 발주는 맨 뒤
  http.get('/api/planned-receipts', () => {
    const items = [...receipts].sort((a, b) =>
      (a.expectedOn ?? '9999').localeCompare(b.expectedOn ?? '9999'),
    )
    return HttpResponse.json({ items, total: items.length })
  }),
  // R2 등록
  http.post('/api/planned-receipts', async ({ request }) => {
    const body = (await request.json()) as {
      productId: number
      quantity: number
      expectedOn: string | null
    }
    const product = mockProducts.find(
      (item) => item.productId === body.productId,
    )
    if (!product) {
      return HttpResponse.json(
        { code: 'NOT_FOUND', message: '상품을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    if (!isQuantity(body.quantity)) return invalidField('quantity')
    const receipt: MockReceipt = {
      receiptId: Math.max(0, ...receipts.map((item) => item.receiptId)) + 1,
      productId: product.productId,
      skuName: product.skuName,
      quantity: body.quantity,
      expectedOn: body.expectedOn,
      receivedOn: null,
      status: body.expectedOn ? 'PENDING' : 'NO_DATE',
      reflected: Boolean(body.expectedOn),
    }
    receipts.push(receipt)
    return HttpResponse.json(
      {
        receiptId: receipt.receiptId,
        reflected: receipt.reflected,
        runId: null,
      },
      { status: 201 },
    )
  }),
  // R3 수정: 보낸 칸만. 도착일을 넣으면 계산에 반영(PENDING)
  http.patch(
    '/api/planned-receipts/:receiptId',
    async ({ params, request }) => {
      const receipt = receipts.find(
        (item) => item.receiptId === Number(params.receiptId),
      )
      if (!receipt) {
        return HttpResponse.json(
          { code: 'NOT_FOUND', message: '발주를 찾을 수 없습니다.' },
          { status: 404 },
        )
      }
      const body = (await request.json()) as {
        quantity?: number
        expectedOn?: string | null
      }
      if (body.quantity !== undefined && !isQuantity(body.quantity)) {
        return invalidField('quantity')
      }
      if (body.quantity !== undefined) receipt.quantity = body.quantity
      if (body.expectedOn !== undefined) {
        receipt.expectedOn = body.expectedOn
        receipt.status = body.expectedOn ? 'PENDING' : 'NO_DATE'
        receipt.reflected = Boolean(body.expectedOn)
      }
      return HttpResponse.json({
        receiptId: receipt.receiptId,
        reflected: receipt.reflected,
        runId: null,
      })
    },
  ),
  // R3 취소: 서버는 CANCELLED로 남기고 목록에서 뺀다. 다시 취소하면 404
  http.delete('/api/planned-receipts/:receiptId', ({ params }) => {
    const before = receipts.length
    receipts = receipts.filter(
      (item) => item.receiptId !== Number(params.receiptId),
    )
    return before === receipts.length
      ? HttpResponse.json(
          { code: 'NOT_FOUND', message: '발주를 찾을 수 없습니다.' },
          { status: 404 },
        )
      : new HttpResponse(null, { status: 204 })
  }),
  // D1 입고 필요 목록 (서버 ReplenishmentNeeds 모양). 날짜는 오늘 기준으로 움직이고, 두 상품은 소진일이 이미 지났다.
  // 서버처럼 사용을 끈(단종) 상품은 목록과 개수에서 뺀다(server #27 혜윤 답).
  http.get('/api/dashboard/replenishment-needs', () => {
    const items = [
      {
        productId: 1,
        skuBarcode: '8800272420016',
        skuName: '케어트릿 120g',
        shortage: -3,
        leadTimeDays: 5,
        recommendedQty: 72,
        recommendedAmount: 129600,
        preArrivalRisk: 0.08,
      },
      {
        productId: 3,
        skuBarcode: '8800272421044',
        skuName: '덴탈껌 S 10입',
        shortage: 1,
        leadTimeDays: 5,
        recommendedQty: 60,
        recommendedAmount: 108000,
        preArrivalRisk: 0.05,
      },
      {
        productId: 2,
        skuBarcode: '8800272420108',
        skuName: '케어트릿 8g 낱개',
        shortage: 4,
        leadTimeDays: 7,
        recommendedQty: 96,
        recommendedAmount: 28800,
        preArrivalRisk: 0.03,
      },
      // 정렬마다 순서가 달라지도록 소진일·위험·금액을 엇갈리게 둔다
      {
        productId: 7,
        skuBarcode: '8800272421200',
        skuName: '연어 져키 80g',
        shortage: -1,
        leadTimeDays: 4,
        recommendedQty: 40,
        recommendedAmount: 52000,
        preArrivalRisk: 0.14,
      },
      {
        productId: 8,
        skuBarcode: '8800272421300',
        skuName: '오리 큐브 100g',
        shortage: 7,
        leadTimeDays: 6,
        recommendedQty: 120,
        recommendedAmount: 210000,
        preArrivalRisk: 0.11,
      },
      {
        productId: 4,
        skuBarcode: '8800272421501',
        skuName: '동결건조 큐브 50g',
        shortage: 3,
        leadTimeDays: 5,
        recommendedQty: 24,
        recommendedAmount: 74400,
        preArrivalRisk: 0.02,
      },
    ]
      .filter(
        (item) =>
          mockProducts.find((product) => product.productId === item.productId)
            ?.isActive ?? true,
      )
      .map(({ shortage, ...item }, index) => ({
        ...item,
        resultId: 9001 + index,
        expectedShortageOn: isoFromToday(shortage),
      }))
    return HttpResponse.json({
      asOfDate: isoFromToday(-1),
      today: isoFromToday(0),
      daysSinceAsOf: 1,
      resultStatus: 'UP_TO_DATE',
      runId: 31,
      resultComputedAt: '2026-10-18T09:00:00+09:00',
      lastFailedRunAt: null,
      latestUploadId: 12,
      summary: {
        needCount: items.length,
        notNeededCount: 22,
        notCalculableCount: 1,
        excludedCount: 1,
      },
      items,
      notCalculable: [
        {
          productId: 9,
          skuName: '신상품 트릿 30g',
          reason: '판매한 날이 7일보다 적어요.',
        },
      ],
      excluded: [
        {
          productId: 10,
          skuName: '덴탈껌 M 5입',
          date: null,
          reason: '재고 숫자가 맞지 않아 계산에서 제외했어요.',
        },
      ],
    })
  }),
  // K1 SKU 상세 (서버 ProductDetail 모양). 아이디로 상태를 고른다:
  // new-product = 계산 불가, no-result = 아직 계산 전, fallback-product = A를 못 써 B로 대체,
  // reference-product = 참고용(정확도 낮음·추정 재고), no-trend = 추이 기록 없음(server #45 전).
  http.get('/api/products/:productId/detail', ({ params }) => {
    const id = String(params.productId)
    const product = (skuName: string, skuBarcode: string) => ({
      productId: Number(id) || 1,
      skuBarcode,
      skuName,
      fulfillment: '서울 풀필먼트',
    })
    const settings = {
      leadTimeDays: 5,
      leadTimeSource: 'PRODUCT',
      reviewCycleDays: 7,
      reviewCycleSource: 'ESTIMATED',
      orderUnitQty: 12,
      unitCost: 1800,
    }
    if (id === 'no-result') {
      return HttpResponse.json({
        product: product('케어트릿 120g', '8800272420016'),
        needStatus: null,
        asOfDate: null,
        expectedShortageOn: null,
        settings,
        result: null,
        accuracy: null,
        trend: [],
      })
    }
    const isUnavailable = id === 'new-product'
    const isReference = id === 'reference-product'
    const isFallback = id === 'fallback-product'
    const days = [
      ['2026-09-01', 45, 4],
      ['2026-09-08', 31, 7],
      ['2026-09-15', 18, 5],
      ['2026-09-22', 0, 2],
      ['2026-09-29', 28, 8],
      ['2026-10-06', 14, 6],
      ['2026-10-14', 4, 9],
    ] as const
    return HttpResponse.json({
      product: isUnavailable
        ? product('신상품 트릿 30g', '8800272421999')
        : product('케어트릿 120g', '8800272420016'),
      needStatus: isUnavailable ? 'NOT_CALCULABLE' : 'NEED_NOW',
      asOfDate: '2026-10-14',
      expectedShortageOn: isUnavailable ? null : '2026-10-22',
      settings,
      result: {
        resultId: 101,
        status: isUnavailable ? 'NOT_CALCULABLE' : 'OK',
        reason: isUnavailable ? '판매한 날이 7일보다 적어요.' : null,
        method: isUnavailable ? null : isFallback ? 'B' : 'A',
        methodReason: isUnavailable
          ? null
          : isFallback
            ? '작년 자료 없어 B로 대체'
            : '평가 결과 기본 방식',
        multiplier: 1.1,
        horizonDays: 12,
        forecastOutboundQty: isFallback ? 66 : 58,
        startStockQty: 4,
        startStockEstimated: isReference,
        plannedReceiptsInHorizon: 12,
        preArrivalUnmetQty: 0,
        requiredQtyBeforeRounding: null,
        recommendedQty: isUnavailable ? null : 72,
        recommendedAmount: isUnavailable ? null : 129600,
      },
      accuracy: isUnavailable
        ? null
        : {
            grade: isReference ? 'LOW' : 'HIGH',
            isReference,
            validObservationDays: isReference ? 21 : 120,
            coverSuccessCount: isReference ? 5 : 9,
            coverTrialCount: 10,
            forecastErrorRate: isReference ? 0.38 : 0.12,
            history: [],
            range: isReference ? { low: 40, high: 70 } : null,
            firstInboundOn: '2026-03-02',
          },
      trend:
        id === 'no-trend'
          ? []
          : days.map(([date, closingQty, outboundQty]) => ({
              date,
              closingQty,
              outboundQty,
              isValidObservation: closingQty > 0,
            })),
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
