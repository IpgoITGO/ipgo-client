import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, expect, it } from 'vitest'
import { AppProviders } from '../../../app/providers/AppProviders'
import { routes } from '../../../app/router/router'
import { login } from '../../../auth/api/authApi'
import { server } from '../../../mocks/server'
import { makePreview, makeReview, saved, version } from '../__fixtures__/review'
import { readAttempt } from '../model/attemptStorage'
import type {
  DecisionRequest,
  PreviewRequest,
  Review,
} from '../model/receiptApi'

let current: Review
let previews: PreviewRequest[]
let decisions: DecisionRequest[]
function resolve() {
  current = {
    ...current,
    currentState: 'RESOLVED',
    version: saved.version,
    capabilities: { keep: false, replace: false, clear: false },
    decisions: [
      {
        decisionId: saved.decisionId,
        action: 'KEEP',
        reason: '원본과 발주를 확인했어요.',
        actorUserId: 1,
        createdAt: '2026-11-09T09:00:00+09:00',
      },
    ],
    lastDecision: null,
  }
}
function renderPage(path = '/receipt-corrections/1') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return {
    ...render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    ),
    router,
  }
}
beforeEach(async () => {
  sessionStorage.clear()
  await login({ email: 'seller@a.com', password: 'pass1234' })
  current = makeReview()
  previews = []
  decisions = []
  server.use(
    http.get('/api/receipt-corrections', ({ request }) =>
      HttpResponse.json({
        items:
          new URL(request.url).searchParams.get('state') === 'OPEN' &&
          current.currentState !== 'OPEN'
            ? []
            : [current],
        nextCursor: null,
      }),
    ),
    http.get('/api/receipt-corrections/1', () => HttpResponse.json(current)),
    http.post('/api/receipt-corrections/1/preview', async ({ request }) => {
      const body = (await request.json()) as PreviewRequest
      previews.push(body)
      return HttpResponse.json(makePreview(body))
    }),
    http.post('/api/receipt-corrections/1/decisions', async ({ request }) => {
      decisions.push((await request.json()) as DecisionRequest)
      resolve()
      return HttpResponse.json(saved)
    }),
  )
})
async function prepare(
  user: ReturnType<typeof userEvent.setup>,
  action = '기존 입고 처리 유지',
) {
  await screen.findByRole('heading', { name: /합성입고상품/ })
  await user.click(screen.getByRole('radio', { name: action }))
  await user.type(
    screen.getByLabelText('확인 이유'),
    '원본과 발주를 확인했어요.',
  )
  await user.click(screen.getByRole('button', { name: '변경 영향 미리보기' }))
  await screen.findByRole('heading', { name: '저장 전 변경 영향' })
}
async function confirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('checkbox', {
      name: '변경 영향과 원본의 경고를 확인했어요',
    }),
  )
  await user.click(screen.getByRole('button', { name: '정정 내용 저장' }))
}

it('조회는 확정하지 않고 이전160/최신200과 발주·허용 동작만 보여 준다', async () => {
  renderPage()
  await screen.findByRole('heading', { name: /합성입고상품/ })
  expect(
    screen.getByRole('heading', { name: '처음 확인한 원본' }).parentElement,
  ).toHaveTextContent('160개')
  expect(
    screen.getByRole('heading', { name: '최신 원본' }).parentElement,
  ).toHaveTextContent('200개')
  expect(
    screen.getByRole('button', { name: '변경 영향 미리보기' }),
  ).toBeDisabled()
  expect(previews).toHaveLength(0)
  expect(decisions).toHaveLength(0)
})
it.each([120, 0])(
  '최신 수량%s에서도 유지 결정을 하기 전후에 부족 경고를 숨기지 않는다',
  async (quantity) => {
    current = makeReview({
      currentSource: { ...current.currentSource, quantity },
      warnings: ['INSUFFICIENT_QUANTITY'],
    })
    const user = userEvent.setup()
    renderPage()
    await prepare(user)
    expect(screen.getByText(/연결된 발주보다 적어요/)).toBeInTheDocument()
    await confirm(user)
    await screen.findByText(/정정 내용을 저장했어요/)
    expect(screen.getByText(/연결된 발주보다 적어요/)).toBeInTheDocument()
    expect(decisions[0]).toMatchObject({
      action: 'KEEP',
      receiptIds: [],
      expectedVersion: version,
      reason: '원본과 발주를 확인했어요.',
    })
  },
)
it('누락·검산 불가의 경고와 서버 capabilities로 쓰기를 제한한다', async () => {
  current = makeReview({
    currentSource: {
      ...current.currentSource,
      present: false,
      valid: false,
      quantity: 0,
    },
    warnings: ['SOURCE_MISSING', 'INVALID_OBSERVATION'],
    capabilities: { keep: true, replace: false, clear: true },
  })
  renderPage()
  await screen.findByRole('heading', { name: /합성입고상품/ })
  expect(screen.getByText('이 입고 기록이 없어요.')).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: '배정 다시 정하기' })).toBeDisabled()
  expect(
    screen.getByRole('radio', { name: '기존 배정 모두 해제' }),
  ).toBeEnabled()
  expect(decisions).toHaveLength(0)
})
it('배정은 자동 선택하지 않고 전량 목록과 미리보기 전후를 확인한 뒤 저장한다', async () => {
  const user = userEvent.setup()
  renderPage()
  await screen.findByRole('heading', { name: /합성입고상품/ })
  await user.click(screen.getByRole('radio', { name: '배정 다시 정하기' }))
  expect(
    screen
      .getAllByRole('checkbox')
      .every((c) => !(c as HTMLInputElement).checked),
  ).toBe(true)
  await user.click(screen.getByRole('checkbox', { name: /발주 13/ }))
  await user.type(screen.getByLabelText('확인 이유'), '전량으로 다시 연결해요.')
  await user.click(screen.getByRole('button', { name: '변경 영향 미리보기' }))
  await screen.findByRole('heading', { name: '저장 전 변경 영향' })
  expect(previews[0].receiptIds).toEqual([13])
  expect(
    screen.getByRole('heading', { name: '변경 후 배정' }).parentElement,
  ).toHaveTextContent('100개')
  expect(screen.getByRole('button', { name: '정정 내용 저장' })).toBeDisabled()
  await confirm(user)
  await screen.findByText(/정정 내용을 저장했어요/)
  expect(decisions[0].receiptIds).toEqual([13])
})
it('전체 해제는 별도 명시 선택·미리보기·확인 뒤 빈 목록으로 보낸다', async () => {
  const user = userEvent.setup()
  renderPage()
  await prepare(user, '기존 배정 모두 해제')
  const after = screen.getByRole('heading', {
    name: '변경 후 배정',
  }).parentElement!
  expect(within(after).getByText('배정 없음')).toBeInTheDocument()
  await confirm(user)
  await screen.findByText(/정정 내용을 저장했어요/)
  expect(decisions[0]).toMatchObject({ action: 'REPLACE', receiptIds: [] })
})
it('서버가 가용량을 거부하면 임의 축소·부분 배정·저장을 하지 않는다', async () => {
  server.use(
    http.post('/api/receipt-corrections/1/preview', async ({ request }) => {
      previews.push((await request.json()) as PreviewRequest)
      return HttpResponse.json(
        { message: '가용 입고량보다 많아요.' },
        { status: 400 },
      )
    }),
  )
  const user = userEvent.setup()
  renderPage()
  await screen.findByRole('heading', { name: /합성입고상품/ })
  await user.click(screen.getByRole('radio', { name: '배정 다시 정하기' }))
  for (const id of [11, 12, 13])
    await user.click(
      screen.getByRole('checkbox', { name: new RegExp(`발주 ${id}`) }),
    )
  await user.type(screen.getByLabelText('확인 이유'), '세 발주 확인')
  await user.click(screen.getByRole('button', { name: '변경 영향 미리보기' }))
  expect(await screen.findByText('가용 입고량보다 많아요.')).toBeInTheDocument()
  expect(previews[0].receiptIds).toEqual([11, 12, 13])
  expect(decisions).toHaveLength(0)
})
it('409 stale은 최신 자료를 읽고 새 검토를 요구하며 자동 재전송하지 않는다', async () => {
  let detailReads = 0
  server.use(
    http.get('/api/receipt-corrections/1', () => {
      detailReads++
      return HttpResponse.json(current)
    }),
    http.post('/api/receipt-corrections/1/preview', () => {
      current = { ...current, version: 'c'.repeat(64) }
      return HttpResponse.json(
        {
          code: 'RECEIPT_CORRECTION_STALE',
          message: '자료가 바뀌었어요. 최신 내용을 확인해 주세요.',
        },
        { status: 409 },
      )
    }),
  )
  const user = userEvent.setup()
  renderPage()
  await screen.findByRole('heading', { name: /합성입고상품/ })
  await user.click(screen.getByRole('radio', { name: '기존 입고 처리 유지' }))
  await user.type(screen.getByLabelText('확인 이유'), '확인')
  await user.click(screen.getByRole('button', { name: '변경 영향 미리보기' }))
  await screen.findByText(/자료가 바뀌었어요/)
  await waitFor(() => expect(detailReads).toBeGreaterThan(1))
  expect(
    screen.queryByRole('button', { name: '정정 내용 저장' }),
  ).not.toBeInTheDocument()
  expect(decisions).toHaveLength(0)
})
it('서버가 이미 저장했지만 응답을 잃으면 재마운트 뒤에도 같은 내용·키로만 재확인한다', async () => {
  server.use(
    http.post('/api/receipt-corrections/1/decisions', async ({ request }) => {
      decisions.push((await request.json()) as DecisionRequest)
      resolve()
      return decisions.length === 1
        ? HttpResponse.error()
        : HttpResponse.json(saved)
    }),
  )
  const user = userEvent.setup()
  const view = renderPage()
  await prepare(user)
  await confirm(user)
  await screen.findByRole('button', { name: '같은 저장 요청 결과 확인' })
  await waitFor(() => expect(decisions).toHaveLength(1))
  expect(readAttempt('seller@a.com', 1)?.phase).toBe('unknown')
  view.unmount()
  view.router.dispose()
  renderPage()
  const retry = await screen.findByRole('button', {
    name: '같은 저장 요청 결과 확인',
  })
  expect(decisions).toHaveLength(1)
  await user.click(retry)
  await screen.findByText(/정정 내용을 저장했어요/)
  expect(decisions).toHaveLength(2)
  expect(decisions[1]).toEqual(decisions[0])
  expect(readAttempt('seller@a.com', 1)).toBeNull()
})
it('연속 클릭해도 저장 요청은 하나만 보내며 완료 이력을 유지한다', async () => {
  server.use(
    http.post('/api/receipt-corrections/1/decisions', async ({ request }) => {
      decisions.push((await request.json()) as DecisionRequest)
      await delay(100)
      resolve()
      return HttpResponse.json(saved)
    }),
  )
  const user = userEvent.setup()
  renderPage()
  await prepare(user)
  await user.click(
    screen.getByRole('checkbox', {
      name: '변경 영향과 원본의 경고를 확인했어요',
    }),
  )
  await user.dblClick(screen.getByRole('button', { name: '정정 내용 저장' }))
  await screen.findByText(/정정 내용을 저장했어요/)
  expect(decisions).toHaveLength(1)
  expect(await screen.findByText(/2026-11-09T09:00/)).toBeInTheDocument()
})
it.each(['PROCESSING', 'FAILED'])(
  '최신 정제가 %s이면 확정을 막고 이전 자료를 보존한다',
  async (status) => {
    current = makeReview({ sourceReady: false })
    server.use(http.get('/api/uploads/9', () => HttpResponse.json({ status })))
    renderPage()
    await screen.findByRole('heading', { name: /합성입고상품/ })
    await screen.findByText(
      status === 'FAILED' ? /최신 원본 정제에 실패/ : /최신 원본을 정제하고/,
    )
    expect(
      screen.getByRole('button', { name: '변경 영향 미리보기' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('heading', { name: '처음 확인한 원본' }).parentElement,
    ).toHaveTextContent('160개')
    expect(previews).toHaveLength(0)
  },
)
it('늦은 정제 완료는 재조회로 반영하고 미리보기는 새로 명시해야 한다', async () => {
  current = makeReview({ sourceReady: false })
  server.use(
    http.get('/api/uploads/9', () =>
      HttpResponse.json({ status: 'PROCESSING' }),
    ),
  )
  const user = userEvent.setup()
  renderPage()
  await screen.findByText(/최신 원본을 정제하고/)
  current = makeReview({ version: 'd'.repeat(64) })
  await user.click(screen.getByRole('button', { name: '최신 상태 다시 확인' }))
  await waitFor(() =>
    expect(
      screen.getByRole('radio', { name: '기존 입고 처리 유지' }),
    ).toBeEnabled(),
  )
  expect(previews).toHaveLength(0)
  expect(decisions).toHaveLength(0)
})
it('403은 권한 안내를 보여 주고 다른 소유자의 상세를 렌더링하지 않는다', async () => {
  server.use(
    http.get('/api/receipt-corrections/1', () =>
      HttpResponse.json({ message: '권한 없음' }, { status: 403 }),
    ),
  )
  renderPage()
  expect(
    await screen.findByText('이 입고를 확인할 권한이 없어요.'),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: /합성입고상품/ }),
  ).not.toBeInTheDocument()
  expect(decisions).toHaveLength(0)
})
it('401 세션 만료는 기존 인증 처리로 로그인 화면으로 이동한다', async () => {
  server.use(
    http.get('/api/receipt-corrections/1', () =>
      HttpResponse.json({ message: '세션 만료' }, { status: 401 }),
    ),
  )
  const view = renderPage()
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe('/login'),
  )
  expect(decisions).toHaveLength(0)
})
it('정정 저장 성공 뒤 계산 실패를 별도로 보여 주고 저장 성공을 지우지 않는다', async () => {
  server.use(
    http.post('/api/receipt-corrections/1/decisions', async ({ request }) => {
      decisions.push((await request.json()) as DecisionRequest)
      resolve()
      return HttpResponse.json({ ...saved, runId: 31 })
    }),
    http.get('/api/calculation-runs/31', () =>
      HttpResponse.json({
        runId: 31,
        status: 'FAILED',
        errorMessage: '후속 계산 실패',
      }),
    ),
  )
  const user = userEvent.setup()
  renderPage()
  await prepare(user)
  await confirm(user)
  expect(
    await screen.findByText(/정정 내용을 저장했어요. 후속 계산/),
  ).toBeInTheDocument()
  expect(await screen.findByText(/후속 계산 실패/)).toBeInTheDocument()
  expect(decisions).toHaveLength(1)
})
it('미리보기 뒤 편집하면 이전 확인을 버리고 이유 칸으로 초점을 돌린다', async () => {
  const user = userEvent.setup()
  renderPage()
  await prepare(user)
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: '저장 전 변경 영향' }),
    ).toHaveFocus(),
  )
  await user.click(screen.getByRole('button', { name: '내용 다시 검토' }))
  await waitFor(() => expect(screen.getByLabelText('확인 이유')).toHaveFocus())
  expect(
    screen.queryByRole('button', { name: '정정 내용 저장' }),
  ).not.toBeInTheDocument()
  expect(decisions).toHaveLength(0)
})
it('목록은 cursor가 있을 때 다음 항목을 요청하며 읽기만 수행한다', async () => {
  server.use(
    http.get('/api/receipt-corrections', ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get('cursor') === '20'
          ? {
              items: [makeReview({ reviewId: 21, skuName: '마지막 합성상품' })],
              nextCursor: null,
            }
          : { items: [makeReview()], nextCursor: 20 },
      ),
    ),
  )
  const user = userEvent.setup()
  renderPage('/receipt-corrections')
  await screen.findByRole('link', { name: /합성입고상품/ })
  await user.click(screen.getByRole('button', { name: '다음 항목 보기' }))
  expect(
    await screen.findByRole('link', { name: /마지막 합성상품/ }),
  ).toBeInTheDocument()
  expect(decisions).toHaveLength(0)
  expect(previews).toHaveLength(0)
})

it('미리보기의 서버 오류는 저장 완료나 빈 정상 결과로 바꾸지 않는다', async () => {
  server.use(
    http.post('/api/receipt-corrections/1/preview', () =>
      HttpResponse.json({ message: '미리보기 서버 오류' }, { status: 500 }),
    ),
  )
  const user = userEvent.setup()
  renderPage()
  await screen.findByRole('heading', { name: /합성입고상품/ })
  await user.click(screen.getByRole('radio', { name: '기존 입고 처리 유지' }))
  await user.type(screen.getByLabelText('확인 이유'), '확인')
  await user.click(screen.getByRole('button', { name: '변경 영향 미리보기' }))
  expect(await screen.findByText('미리보기 서버 오류')).toBeInTheDocument()
  expect(decisions).toHaveLength(0)
  expect(
    screen.queryByRole('button', { name: '정정 내용 저장' }),
  ).not.toBeInTheDocument()
})
it('확정 시점의 409도 요청을 새 키로 자동 재시도하지 않는다', async () => {
  server.use(
    http.post('/api/receipt-corrections/1/decisions', async ({ request }) => {
      decisions.push((await request.json()) as DecisionRequest)
      current = makeReview({ version: 'c'.repeat(64) })
      return HttpResponse.json(
        {
          code: 'RECEIPT_CORRECTION_STALE',
          message: '확정 전 자료가 바뀌었어요.',
        },
        { status: 409 },
      )
    }),
  )
  const user = userEvent.setup()
  renderPage()
  await prepare(user)
  await confirm(user)
  await screen.findByText('확정 전 자료가 바뀌었어요.')
  expect(decisions).toHaveLength(1)
  expect(readAttempt('seller@a.com', 1)).toBeNull()
  expect(
    screen.queryByRole('button', { name: '같은 저장 요청 결과 확인' }),
  ).not.toBeInTheDocument()
})
it('현재 확인이 완료돼도 과거 업로드의 경고를 임의로 지우지 않는다', async () => {
  server.use(
    http.get('/api/uploads/8', () =>
      HttpResponse.json({
        uploadId: 8,
        status: 'DONE',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-08',
        asOfDate: '2026-11-08',
        runId: null,
        validation: { checkedSkuCount: 1, targetSkuCount: 1, excludedSkus: [] },
        matchedReceipts: [],
        receiptMatching: {
          status: 'REVIEW_REQUIRED',
          issues: [
            { productId: 7, stockDate: '2026-11-08', reason: 'SOURCE_CHANGED' },
          ],
        },
      }),
    ),
  )
  const user = userEvent.setup()
  renderPage()
  await prepare(user)
  await confirm(user)
  await screen.findByText(/정정 내용을 저장했어요/)
  await user.click(
    screen.getByRole('link', { name: /1차 원본의 업로드 결과 보기/ }),
  )
  expect(
    await screen.findByRole('region', { name: '업로드 당시 입고 확인 사항' }),
  ).toHaveTextContent('이후 확정한 현재 상태와 다를 수 있어요.')
  expect(screen.getByText(/원본 입고 내용이 바뀌었어요/)).toBeInTheDocument()
  expect(decisions).toHaveLength(1)
})

it('보관한 미리보기도 최신 capabilities가 거부하면 그대로 확정하지 않는다', async () => {
  const user = userEvent.setup()
  const view = renderPage()
  await prepare(user)
  view.unmount()
  view.router.dispose()
  current = makeReview({
    capabilities: { keep: false, replace: false, clear: false },
  })
  renderPage()
  await screen.findByRole('heading', { name: '저장 전 변경 영향' })
  expect(screen.getByRole('button', { name: '정정 내용 저장' })).toBeDisabled()
  expect(
    screen.getByRole('checkbox', {
      name: '변경 영향과 원본의 경고를 확인했어요',
    }),
  ).toBeDisabled()
  expect(decisions).toHaveLength(0)
})
it('검토 내용을 바꾸면 새 미리보기와 새 요청 키를 사용한다', async () => {
  const user = userEvent.setup()
  renderPage()
  await prepare(user)
  const first = readAttempt('seller@a.com', 1)!.request.idempotencyKey
  await user.click(screen.getByRole('button', { name: '내용 다시 검토' }))
  await user.click(screen.getByRole('radio', { name: '기존 입고 처리 유지' }))
  await user.type(screen.getByLabelText('확인 이유'), ' 다시 검토했어요.')
  await user.click(screen.getByRole('button', { name: '변경 영향 미리보기' }))
  await screen.findByRole('heading', { name: '저장 전 변경 영향' })
  expect(readAttempt('seller@a.com', 1)!.request.idempotencyKey).not.toBe(first)
  expect(previews).toHaveLength(2)
  expect(decisions).toHaveLength(0)
})
