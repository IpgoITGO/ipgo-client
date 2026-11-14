import { billingHandlers } from '../features/billing/mocks/billingHandlers'
import { receiptHandlers } from '../features/receipts/mocks/receiptHandlers'
import { plannedQuantityHandlers } from '../features/sku/mocks/plannedQuantityHandlers'
import { storageCostHandlers } from '../features/settings/mocks/storageCostHandlers'
import { expiryHandlers } from '../features/expiry/mocks/expiryHandlers'
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
// 대시보드 "입고가 필요한 상품"(D1). shortage = 오늘부터 며칠 뒤 소진(음수면 이미 지남).
// 상품 상세(K1) mock도 이 목록을 보고 같은 상품 이름·권장량·소진일을 돌려준다.
const NEEDED_ITEMS = [
  {
    productId: 1,
    skuBarcode: '8800272420016',
    skuName: '케어트릿 120g',
    shortage: -3,
    leadTimeDays: 5,
    recommendedQty: 72,
    recommendedAmount: 129600,
    preArrivalRisk: 0.08,
    // 판매 급변(server #193 요청 모양). 실데이터 9월 비건쿠키처럼 평소의 몇 배로 튄 상품
    demandShift: {
      direction: 'UP',
      recentDailyQty: 8,
      baselineDailyQty: 0.4,
      ratio: 20,
      since: isoFromToday(-7),
    },
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

// 실데이터 9월 비건쿠키 블루베리와 같은 모양(주별 하루 평균): 평소 0~0.7개, 지난 입고 뒤 마지막 주만 하루 4개.
// 작년 같은 주도 실데이터 값. 하루 기록 91일(13주)로 펼친다.
const SHIFT_WEEKS = [0.4, 0.4, 0, 0.7, 0.1, 0.4, 0, 0.3, 0, 0, 0.1, 0.4, 8]
const SHIFT_LAST_YEAR = [
  0.4, 0.6, 0.4, 0.1, 1, 1.3, 1, 1.6, 0.7, 0.4, 0.1, 0.7, 1.3,
]
// 다시 줄어든 상품(저키 스틱 22): 평소 하루 1개 안팎 → 4주 급증(6~7개) → 이번 주 1.2개로 돌아옴
const CALM_WEEKS = [0.9, 1.1, 0.7, 1, 1.3, 0.9, 1, 0.8, 6.4, 7.1, 6.6, 5.9, 1.2]
const CALM_LAST_YEAR = [
  1, 0.9, 1.2, 1.1, 0.8, 1, 1.3, 1.1, 0.9, 1.2, 1, 0.8, 1.1,
]
function spread(avg: number, day: number) {
  // 한 주 합계를 앞 요일부터 하루 1개씩(급증 주는 고르게)
  const total = Math.round(avg * 7)
  return Math.floor(total / 7) + (day < total % 7 ? 1 : 0)
}
function shiftTrend(weeks = SHIFT_WEEKS, lastYear = SHIFT_LAST_YEAR) {
  let stock = 30
  return Array.from({ length: 91 }, (_, i) => {
    const week = Math.floor(i / 7)
    const outboundQty = spread(weeks[week], i % 7)
    if (week % 4 === 3 && i % 7 === 0) stock += 40 // 4주마다 입고
    stock = Math.max(0, stock - outboundQty)
    return {
      date: isoFromToday(i - 91),
      closingQty: stock,
      outboundQty,
      lastYearOutboundQty: spread(lastYear[week], i % 7),
      isValidObservation: stock > 0,
    }
  })
}

function isoFromToday(n: number) {
  const date = new Date()
  date.setDate(date.getDate() + n)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// C2 mock이 번호마다 몇 번 불렸는지
const runPolls = new Map<number, number>()

// 알림 설정(받을 시각 등). 저장(PATCH)이 없어서 로컬에선 늘 "서버에 연결하지 못했어요"가 떴다(11/14)
const defaultNotificationSettings = {
  enabled: false,
  sendHour: 9,
  timeZone: 'Asia/Seoul',
}
let notificationSettings = { ...defaultNotificationSettings }
export function resetNotificationSettingsMock() {
  notificationSettings = { ...defaultNotificationSettings }
}

export const handlers = [
  http.get('/api/notifications/settings', () =>
    HttpResponse.json(notificationSettings),
  ),
  http.patch('/api/notifications/settings', async ({ request }) => {
    const body = (await request.json()) as Partial<typeof notificationSettings>
    notificationSettings = { ...notificationSettings, ...body }
    return HttpResponse.json(notificationSettings)
  }),
  http.get('/api/push/public-key', () =>
    HttpResponse.json(
      { code: 'PUSH_UNAVAILABLE', message: '알림 서비스를 준비 중이에요.' },
      { status: 503 },
    ),
  ),
  ...receiptHandlers,
  ...plannedQuantityHandlers,
  ...storageCostHandlers,
  ...expiryHandlers,
  ...billingHandlers,
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
    mockProducts.forEach((product) => {
      for (const field of [
        'leadTimeDays',
        'reviewCycleDays',
        'orderUnitQty',
      ] as const) {
        if (!product.overridden.includes(field))
          product.settings[field] = defaults[field]
      }
    })
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
      const body = (await request.json()) as Record<
        string,
        number | null | undefined
      >
      const fields = [
        'leadTimeDays',
        'reviewCycleDays',
        'orderUnitQty',
      ] as const
      for (const field of fields) {
        const value = body[field]
        if (value != null && (!Number.isInteger(value) || value < 1)) {
          return invalidField(field)
        }
      }
      product.settings = {
        leadTimeDays: body.leadTimeDays ?? defaults.leadTimeDays,
        reviewCycleDays: body.reviewCycleDays ?? defaults.reviewCycleDays,
        orderUnitQty: body.orderUnitQty ?? defaults.orderUnitQty,
      }
      product.overridden = fields.filter((field) => body[field] != null)
      if (body.unitCost != null) product.unitCost = body.unitCost
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
    const items = NEEDED_ITEMS.filter(
      (item) =>
        mockProducts.find((product) => product.productId === item.productId)
          ?.isActive ?? true,
    ).map(({ shortage, ...item }) => ({
      ...item,
      resultId: item.productId,
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
      // 아직 괜찮은 상품(server #108): 주문까지 칸을 볼 수 있게 날짜·리드타임을 준다
      notNeededItems: [
        {
          productId: 21,
          // 지금 넣기의 오리 큐브(8)와 같은 상품이 두 번 보이지 않게 다른 상품으로(11/10)
          skuName: '치킨 져키 70g',
          skuBarcode: '8800272421555',
          expectedShortageOn: isoFromToday(10),
          leadTimeDays: 6,
        },
        {
          productId: 22,
          skuName: '저키 스틱 100g',
          skuBarcode: '8800272421273',
          expectedShortageOn: isoFromToday(24),
          leadTimeDays: 5,
          // 급증이 끝나 권장량이 크게 줄어든 상품
          demandShift: {
            direction: 'DOWN',
            recentDailyQty: 1.2,
            baselineDailyQty: 6.5,
            ratio: 0.2,
            since: isoFromToday(-7),
          },
        },
        {
          productId: 23,
          skuName: '동결 큐브 30g',
          skuBarcode: '8800272421611',
          expectedShortageOn: isoFromToday(42),
          leadTimeDays: 7,
        },
      ],
      summary: {
        needCount: items.length,
        notNeededCount: 3, // 아래 notNeededItems 줄 수와 같게(11/11: 카드 22 vs 탭 3이 달라 보이던 것)
        notCalculableCount: 1,
        excludedCount: 1,
      },
      items,
      notCalculable: [
        {
          productId: 9,
          skuName: '신상품 트릿 30g',
          // 실제 엔진 문장(작년 같은 기간 + 최근 28일) — 자세한 계산 사유 펼침을 볼 수 있게
          reason:
            '최근 28일 중 판매한 날이 5일로 7일보다 적어요. 작년 같은 기간(2025-11-01 ~ 2025-11-25) 판매한 날이 0일로 7일보다 적어요',
        },
      ],
      excluded: [
        {
          productId: 10,
          skuName: '덴탈껌 M 5입',
          // 실제 서버 문장 모양(11/10 dev에서 본 것)
          date: '2026-09-12',
          reason:
            '기초 34 + 입고 0 − 출고 3 + 조정 0 = 31개인데 기록된 기말은 34개예요',
        },
      ],
    })
  }),
  // K1 SKU 상세 (서버 ProductDetail 모양). 아이디로 상태를 고른다:
  // new-product = 계산 불가, no-result = 아직 계산 전, fallback-product = A를 못 써 B로 대체,
  // reference-product = 참고용(정확도 낮음·추정 재고), no-trend = 추이 기록 없음(server #45 전),
  // stale-stock = 마지막 기록 재고와 계산 시작 재고가 다름,
  // empty-values = 서버가 값을 비워 보냄(출고지·입고 조건·단가·소진일·시작 재고·정확도 null).
  http.get('/api/products/:productId/detail', ({ params }) => {
    const id = String(params.productId)
    const isEmpty = id === 'empty-values'
    if (id === 'missing-product')
      return HttpResponse.json(
        { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' },
        { status: 404 },
      )
    const needed = NEEDED_ITEMS.find((item) => String(item.productId) === id)
    const product = (skuName: string, skuBarcode: string) => ({
      productId: Number(id) || 1,
      skuBarcode: needed?.skuBarcode ?? skuBarcode,
      skuName: needed?.skuName ?? skuName,
      fulfillment: isEmpty ? null : '서울 풀필먼트',
    })
    const settings = {
      leadTimeDays: isEmpty ? null : (needed?.leadTimeDays ?? 5),
      leadTimeSource: 'PRODUCT',
      reviewCycleDays: isEmpty ? null : 7,
      reviewCycleSource: 'ESTIMATED',
      orderUnitQty: isEmpty ? null : 12,
      unitCost: isEmpty ? null : 1800,
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
    // 추정 시작 재고 0 → 엔진이 이미 지난 소진일을 실제 날짜로 준 경우(ai #76)
    const isAlreadyOut = id === 'already-out'
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
      // 대시보드와 같은 계산 결과라 기준일도 같게(내 입고량 기준 비교, #224)
      asOfDate: isoFromToday(-1),
      expectedShortageOn:
        isUnavailable || isEmpty
          ? null
          : isAlreadyOut
            ? isoFromToday(-3)
            : needed
              ? isoFromToday(needed.shortage)
              : '2026-10-22',
      settings,
      result: {
        // mock은 상품 아이디를 결과 번호로 그대로 써서, 아래 K2·K4 mock이 같은 아이디로 상태를 고른다.
        resultId: Number(id) || id,
        status: isUnavailable ? 'NOT_CALCULABLE' : 'OK',
        reason: isUnavailable
          ? '최근 28일 중 판매한 날이 5일로 7일보다 적어요'
          : null,
        method: isUnavailable ? null : isFallback ? 'B' : 'A',
        methodReason: isUnavailable
          ? null
          : isFallback
            ? '작년 자료 없어 B로 대체'
            : '평가 결과 기본 방식',
        multiplier: 1.1,
        horizonDays: 12,
        forecastOutboundQty: isFallback ? 66 : 58,
        startStockQty: isEmpty
          ? null
          : isAlreadyOut
            ? 0
            : id === 'stale-stock'
              ? 9
              : 4,
        startStockEstimated: isReference || isAlreadyOut,
        plannedReceiptsInHorizon: 12,
        // fallback-product = 입고 전에 이미 놓친 주문이 있는 경우(휘님 시험 자료 B조건처럼 5개)
        preArrivalUnmetQty: isFallback ? 5 : 0,
        requiredQtyBeforeRounding: null,
        recommendedQty: isUnavailable ? null : (needed?.recommendedQty ?? 72),
        recommendedAmount:
          isUnavailable || isEmpty
            ? null
            : (needed?.recommendedAmount ?? 129600),
      },
      accuracy: isUnavailable
        ? null
        : {
            grade: isReference ? 'LOW' : 'HIGH',
            isReference,
            validObservationDays: isReference ? 21 : 120,
            coverSuccessCount: isEmpty ? null : isReference ? 5 : 9,
            coverTrialCount: isEmpty ? null : 10,
            forecastErrorRate: isEmpty ? null : isReference ? 0.38 : 0.12,
            // 지난 예측 맞춰 보기 그래프를 로컬에서도 보이게: 최근 10주, 기준일마다 다음 10일 예측·실제·버텼나
            evaluation: isEmpty
              ? null
              : {
                  status: 'AVAILABLE',
                  reason: null,
                  source: 'HISTORICAL_REPLAY',
                  period: 'TUNE',
                  periodStart: isoFromToday(-77),
                  periodEnd: isoFromToday(-14),
                  observedThrough: isoFromToday(-1),
                  horizonDays: 10,
                },
            history: isEmpty
              ? []
              : (
                  [
                    [13, 12],
                    [12, 13],
                    [14, 13],
                    [13, 11],
                    [15, 19, false],
                    [14, 14],
                    [13, 12],
                    [12, 13],
                    [14, 15],
                    [15, 13],
                  ] as Array<[number, number, boolean?]>
                ).map(([forecastQty, actualQty, covered = true], index) => ({
                  originDate: isoFromToday(-77 + index * 7),
                  forecastQty,
                  actualQty,
                  covered,
                })),
            range: isReference ? { low: 40, high: 70 } : null,
            firstInboundOn: '2026-03-02',
          },
      trend:
        id === 'no-trend'
          ? []
          : // 판매 급변 팝업 그래프를 브라우저에서 볼 수 있게(11/12): 케어트릿(1)은 91일 하루 기록. 테스트는 짧은 주별 그대로
            id === '1' && import.meta.env.MODE !== 'test'
            ? shiftTrend()
            : id === '22' && import.meta.env.MODE !== 'test'
              ? shiftTrend(CALM_WEEKS, CALM_LAST_YEAR)
              : days.map(([date, closingQty, outboundQty], index) => {
                  const soldOut =
                    needed !== undefined &&
                    needed.shortage < 0 &&
                    index === days.length - 1
                  return {
                    date,
                    closingQty: soldOut ? 0 : closingQty,
                    outboundQty,
                    isValidObservation: !soldOut && closingQty > 0,
                  }
                }),
    })
  }),
  // K2 시나리오(명세 3.7 · ERD scenario_results). zero-recommendation = 권장량 0개라 비교표 없음
  http.get('/api/results/:resultId/scenarios', ({ params }) => {
    const id = String(params.resultId)
    return HttpResponse.json({
      resultId: Number(id) || 101,
      isEstimate: true,
      preArrivalRisk: 0.08,
      riskSampleSize: 44,
      riskStatus: 'OK',
      // server #85: 입고 전 못 판 양(결과에 하나)과 시나리오마다 입고 뒤 못 판 양
      preArrivalUnmetQty: 0,
      scenarios:
        id === 'zero-recommendation'
          ? []
          : [
              {
                scenarioId: 1,
                type: 'P80',
                qty: 60,
                isDuplicate: false,
                expectedDepletionOn: '2026-11-18',
                expectedEndingStock: 14,
                unmetDemandQty: 6,
                postArrivalUnmetQty: 6,
                postArrivalRisk: 0.09,
              },
              {
                scenarioId: 2,
                type: 'P100',
                qty: 72,
                isDuplicate: false,
                expectedDepletionOn: '2026-11-27',
                expectedEndingStock: 26,
                unmetDemandQty: 0,
                postArrivalUnmetQty: 0,
                postArrivalRisk: 0.03,
              },
              {
                scenarioId: 3,
                type: 'P120',
                qty: 84,
                isDuplicate: false,
                expectedDepletionOn: '2026-12-05',
                expectedEndingStock: 38,
                unmetDemandQty: 0,
                postArrivalUnmetQty: 0,
                postArrivalRisk: null,
              },
            ],
    })
  }),
  // K3 직접 입력(명세 3.7). 결과 1건에 1개만 저장하고 새로 넣으면 덮어쓴다.
  http.post('/api/results/:resultId/scenarios', async ({ request }) => {
    const body = (await request.json()) as { qty: number }
    if (!Number.isInteger(body.qty) || body.qty < 1) {
      return HttpResponse.json(
        { code: 'INVALID_INPUT', message: '1개 이상의 정수를 입력해 주세요.' },
        { status: 400 },
      )
    }
    return HttpResponse.json(
      {
        scenarioId: 4,
        type: 'CUSTOM',
        qty: body.qty,
        isDuplicate: false,
        expectedDepletionOn: '2026-12-10',
        expectedEndingStock: body.qty - 46,
        unmetDemandQty: 0,
        postArrivalRisk: 0.02,
      },
      { status: 201 },
    )
  }),
  // C2 계산 상태(명세 3.4 · ERD calculation_runs). 999 = 실패
  http.get('/api/calculation-runs/:runId', ({ params }) => {
    const runId = Number(params.runId)
    // 같은 번호를 처음 물으면 계산 중, 그다음부터 결과. 브라우저에선 계산 중 화면(스켈레톤)을 볼 수 있게 6번(약 12초)까지 계산 중
    const asked = (runPolls.get(runId) ?? 0) + 1
    runPolls.set(runId, asked)
    const runningPolls = import.meta.env.MODE === 'test' ? 1 : 6
    if (asked <= runningPolls && runId !== 999) {
      return HttpResponse.json({ runId, status: 'RUNNING' })
    }
    if (runId === 999) {
      return HttpResponse.json({
        runId,
        status: 'FAILED',
        errorMessage: '계산 시간이 너무 오래 걸렸어요',
        previousRunId: 31,
      })
    }
    return HttpResponse.json({
      runId,
      status: 'DONE',
      asOfDate: '2026-10-14',
      engineVersion: '0.3.1',
      summary: {
        needCount: 6,
        notNeededCount: 3, // 대시보드 가짜 값(괜찮은 상품 3)과 같게(11/11)
        notCalculableCount: 2,
        excludedCount: 1,
      },
      startedAt: '2026-10-19T09:00:01+09:00',
      completedAt: '2026-10-19T09:00:21+09:00',
    })
  }),
  // K4 AI 인사이트(명세 3.8 주소, ipgo-ai 0002 계약 모양). 결과 번호(= mock 상품 아이디)로 상태를 고른다:
  // ai-fallback = 기본 문장(AI 늦음), ai-none = 비교표만, ai-stale = 갱신 전,
  // reference-product = 확인 필요, zero-recommendation = 입고 불필요, new-product = 계산 불가
  http.get('/api/results/:resultId/insight', ({ params }) => {
    const id = String(params.resultId)
    const base = {
      mode: 'LLM',
      sentences: [
        '권장량 72개를 입고하면 도착 전 품절 위험은 8%, 도착 후 위험은 3%로 낮아져요.',
        '60개보다 다음 입고 시점 재고가 12개 더 남아요.',
      ],
      state: 'NORMAL',
      stateReason: null,
      failReason: null,
      stale: false,
    }
    if (id === 'ai-fallback') {
      return HttpResponse.json({
        ...base,
        mode: 'TEMPLATE',
        failReason: 'LLM_TIMEOUT',
        sentences: [
          '권장 입고량 72개를 기준으로 도착 전 품절 위험과 다음 입고 시점 재고를 함께 확인해 주세요.',
        ],
      })
    }
    if (id === 'ai-none') {
      return HttpResponse.json({
        ...base,
        mode: 'NONE',
        sentences: [],
        failReason: 'LLM_ERROR',
      })
    }
    if (id === 'ai-stale') return HttpResponse.json({ ...base, stale: true })
    if (id === 'reference-product') {
      return HttpResponse.json({
        ...base,
        state: 'CHECK_NEEDED',
        stateReason: '시작 재고가 추정값이에요',
      })
    }
    if (id === 'zero-recommendation') {
      return HttpResponse.json({
        ...base,
        mode: 'TEMPLATE',
        state: 'NOT_NEEDED',
        sentences: [
          '지금 재고로 다음 입고 때까지 버틸 수 있어요. 이번엔 넣지 않아도 돼요.',
        ],
      })
    }
    if (id === 'new-product') {
      return HttpResponse.json({
        ...base,
        mode: 'TEMPLATE',
        state: 'NOT_CALCULABLE',
        sentences: [
          '판매한 날이 7일보다 적어 권장량을 계산하지 못했어요. 이 상품은 기존 방식으로 판단해 주세요.',
        ],
      })
    }
    return HttpResponse.json(base)
  }),
]
