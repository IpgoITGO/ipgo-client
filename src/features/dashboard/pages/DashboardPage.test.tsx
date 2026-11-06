import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { DashboardPage } from './DashboardPage'
import { AppLayout } from '../../../app/ui/AppLayout'
import { CalculationStatus } from '../../../shared/ui/CalculationStatus/CalculationStatus'

// 서버가 아직 한 번도 계산하지 않았을 때의 D1 응답
const noResult = (latestUploadId: number | null) => ({
  asOfDate: null,
  today: '2026-11-01',
  daysSinceAsOf: null,
  resultStatus: null,
  runId: null,
  resultComputedAt: null,
  lastFailedRunAt: null,
  latestUploadId,
  summary: {
    needCount: 0,
    notNeededCount: 0,
    notCalculableCount: 0,
    excludedCount: 0,
  },
  items: [],
  notCalculable: [],
  excluded: [],
})

const renderPage = () =>
  render(
    <AppProviders>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </AppProviders>,
  )

const renderWithRun = (runId: number) =>
  render(
    <AppProviders>
      <MemoryRouter initialEntries={[`/dashboard?run=${runId}`]}>
        <DashboardPage />
        <CalculationStatus />
      </MemoryRouter>
    </AppProviders>,
  )

const safeDashboard = {
  ...noResult(null),
  asOfDate: '2026-11-05',
  daysSinceAsOf: 0,
  resultStatus: 'UP_TO_DATE',
  summary: { ...noResult(null).summary, notNeededCount: 101 },
}

const safeProduct = (id: number) => ({
  productId: id,
  skuName: `안전상품-${id}`,
  skuBarcode: `880${String(id).padStart(10, '0')}`,
  unitCost: 100,
  isActive: true,
})

const renderSafe = () =>
  render(
    <AppProviders>
      <MemoryRouter initialEntries={['/dashboard?tab=safe']}>
        <DashboardPage />
      </MemoryRouter>
    </AppProviders>,
  )

describe('아직 괜찮은 상품 목록', () => {
  it('101번째 상품도 다음 페이지에서 받아 검색할 수 있다', async () => {
    const pages: number[] = []
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json(safeDashboard),
      ),
      http.get('/api/products', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        pages.push(page)
        return HttpResponse.json({
          items:
            page === 0
              ? Array.from({ length: 100 }, (_, index) =>
                  safeProduct(index + 1),
                )
              : [safeProduct(101)],
          total: 101,
          page,
          size: 100,
        })
      }),
    )
    const user = userEvent.setup()
    renderSafe()
    await screen.findByText('안전상품-101')
    expect(pages).toEqual([0, 1])
    await user.type(
      screen.getByLabelText('목록에서 상품 찾기'),
      safeProduct(101).skuBarcode,
    )
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('안전상품-101')
  })

  it.each(['503', 'empty'])(
    '다음 페이지가 %s이면 일부 목록 대신 오류를 표시하고 재시도로 복구한다',
    async (failure) => {
      let recovered = false
      server.use(
        http.get('/api/dashboard/replenishment-needs', () =>
          HttpResponse.json(safeDashboard),
        ),
        http.get('/api/products', ({ request }) => {
          const page = Number(new URL(request.url).searchParams.get('page'))
          if (page === 1 && !recovered && failure === '503') {
            return HttpResponse.json({ message: '조회 실패' }, { status: 503 })
          }
          return HttpResponse.json({
            items:
              page === 0
                ? Array.from({ length: 100 }, (_, index) =>
                    safeProduct(index + 1),
                  )
                : recovered
                  ? [safeProduct(101)]
                  : [],
            total: 101,
            page,
            size: 100,
          })
        }),
      )
      const user = userEvent.setup()
      renderSafe()
      expect(await screen.findByRole('alert')).toHaveTextContent(
        '아직 괜찮은 상품을 불러오지 못했어요',
      )
      expect(
        screen.queryByText('아직 괜찮은 상품이 없어요.'),
      ).not.toBeInTheDocument()
      expect(screen.queryByText('안전상품-1')).not.toBeInTheDocument()
      recovered = true
      await user.click(screen.getByRole('button', { name: '다시 시도' }))
      await screen.findByText('안전상품-101')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('첫 페이지 조회 실패도 빈 목록으로 표시하지 않는다', async () => {
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json(safeDashboard),
      ),
      http.get('/api/products', () =>
        HttpResponse.json({ message: '조회 실패' }, { status: 503 }),
      ),
    )
    renderSafe()
    await screen.findByRole('alert')
    expect(
      screen.queryByText('아직 괜찮은 상품이 없어요.'),
    ).not.toBeInTheDocument()
  })

  it('서버가 빈 목록을 명시하면 상품 API를 추가 조회하지 않는다', async () => {
    let calls = 0
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json({
          ...safeDashboard,
          summary: { ...safeDashboard.summary, notNeededCount: 0 },
          notNeededItems: [],
        }),
      ),
      http.get('/api/products', () => {
        calls++
        return HttpResponse.error()
      }),
    )
    renderSafe()
    await screen.findByText('아직 괜찮은 상품이 없어요.')
    expect(calls).toBe(0)
  })
})

describe('DashboardPage', () => {
  it('run 주소로 와도 계산 상태는 공통 작은 창 하나로만 보이고 한 번만 조회한다', async () => {
    let reads = 0
    server.use(
      http.get('/api/calculation-runs/7125', () => {
        reads++
        return HttpResponse.json({
          runId: 7125,
          status: 'DONE',
          summary: { needCount: 3, notNeededCount: 2 },
        })
      }),
    )
    const user = userEvent.setup()
    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/dashboard?run=7125']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppProviders>,
    )
    expect(await screen.findByText('계산을 마쳤어요')).toBeInTheDocument()
    expect(screen.getAllByText('계산을 마쳤어요')).toHaveLength(1)
    expect(
      screen.getAllByRole('region', { name: '입고량 계산 상태' }),
    ).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '계산 상태 닫기' }))
    expect(screen.queryByText('계산을 마쳤어요')).not.toBeInTheDocument()
    expect(reads).toBe(1)
  })

  it('대시보드 조회 오류에서는 이전 표를 유지하고 같은 계산의 상태만 다시 확인한다', async () => {
    let available = false
    let reads = 0
    server.use(
      http.get('/api/calculation-runs/7126', () => {
        reads++
        return available
          ? HttpResponse.json({ runId: 7126, status: 'DONE' })
          : HttpResponse.json(
              { code: 'TEMPORARY', message: '합성 조회 오류' },
              { status: 503 },
            )
      }),
    )
    const user = userEvent.setup()
    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/dashboard?run=7126']}>
          <DashboardPage />
          <CalculationStatus />
        </MemoryRouter>
      </AppProviders>,
    )
    expect(
      await screen.findByRole('button', { name: '상태 다시 확인' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /지금 넣어야 할 상품이 6개/ }),
    ).toBeInTheDocument()
    available = true
    await user.click(screen.getByRole('button', { name: '상태 다시 확인' }))
    expect(await screen.findByText('계산을 마쳤어요')).toBeInTheDocument()
    expect(reads).toBe(2)
  })
  it('저장·업로드 뒤 계산 번호로 오면 계산 중이었다가 끝나면 결과 수를 알린다', async () => {
    renderWithRun(41)

    expect(
      await screen.findByText('입고량을 계산하고 있어요'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '계산 멈추기' }),
    ).toBeInTheDocument()
    // mock은 두 번째 물음부터 끝(2초 간격)
    expect(
      await screen.findByText('계산을 마쳤어요', {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('입고가 필요한 상품 6개 · 지금은 괜찮은 상품 22개'),
    ).toBeInTheDocument()
  })

  it('계산 중에는 스켈레톤, 지난 결과 보기로 열 수 있고, 끝나면 바꿨다고 알린 뒤 사라진다', async () => {
    // 지난 결과 보기를 누를 때까지는 계산 중으로 둔다(누르기 전에 끝나면 시험이 흔들린다)
    let finish = false
    server.use(
      http.get('/api/calculation-runs/41', () =>
        HttpResponse.json({
          runId: 41,
          status: finish ? 'DONE' : 'RUNNING',
          startedAt: '2026-10-19T09:00:01+09:00',
        }),
      ),
    )
    renderWithRun(41)

    expect(
      await screen.findByText(/새 수불부를 계산하고 있어요 · \d+분째/),
    ).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument()
    expect(screen.getByText('끝나면 여기에 바로 떠요')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: /지난 결과\(\d+\/\d+\) 보기/ }),
    )
    expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    expect(screen.getByText(/아래는 \d+\/\d+ 결과예요/)).toBeInTheDocument()
    finish = true
    expect(
      await screen.findByText('새 결과로 바꿨어요', {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    await waitFor(
      () =>
        expect(
          screen.queryByText('새 결과로 바꿨어요'),
        ).not.toBeInTheDocument(),
      { timeout: 6000 },
    )
  }, 15000)

  it('계산이 실패하면 이유를 알린다', async () => {
    renderWithRun(999)

    expect(
      await screen.findByText('계산을 마치지 못했어요'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('계산 시간이 너무 오래 걸렸어요'),
    ).toBeInTheDocument()
  })

  // 11/5: 서버에서 계산이 멈추면(ipgo-server#102) 셀러가 멈출 수 있어야 한다
  it('계산 멈추기를 누르면 서버에 취소를 요청하고 더 기다리지 않는다', async () => {
    let canceled = 0
    server.use(
      http.get('/api/calculation-runs/7130', () =>
        HttpResponse.json({ runId: 7130, status: 'RUNNING' }),
      ),
      http.post('/api/calculation-runs/7130/cancel', () => {
        canceled++
        return HttpResponse.json({ runId: 7130, status: 'CANCELED' })
      }),
    )
    const user = userEvent.setup()
    renderWithRun(7130)

    await user.click(await screen.findByRole('button', { name: '계산 멈추기' }))
    expect(canceled).toBe(1)
    expect(
      screen.queryByRole('region', { name: '입고량 계산 상태' }),
    ).not.toBeInTheDocument()
  })

  it('서버에 취소가 아직 없어도(404) 화면은 기다리기를 그만둔다', async () => {
    server.use(
      http.get('/api/calculation-runs/7131', () =>
        HttpResponse.json({ runId: 7131, status: 'QUEUED' }),
      ),
      http.post('/api/calculation-runs/7131/cancel', () =>
        HttpResponse.json(
          { code: 'NOT_FOUND', message: '없음' },
          { status: 404 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWithRun(7131)

    expect(
      await screen.findByText('계산을 기다리고 있어요'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '계산 멈추기' }))
    expect(
      screen.queryByRole('region', { name: '입고량 계산 상태' }),
    ).not.toBeInTheDocument()
  })

  it('상태별 요약과 입고 필요 상품을 정렬한다', async () => {
    const user = userEvent.setup()
    render(
      <AppProviders>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AppProviders>,
    )
    expect(
      await screen.findByRole('heading', { name: /지금 넣어야 할 상품이 6개/ }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '금액 큰 순' }))
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('오리 큐브 100g')

    // 정렬마다 맨 위가 달라진다
    await user.click(screen.getByRole('radio', { name: '품절 위험 높은 순' }))
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('연어 져키 80g')
    await user.click(screen.getByRole('radio', { name: '소진일 빠른 순' }))
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('케어트릿 120g')
    expect(screen.getAllByRole('row')).toHaveLength(7)
  })

  it('예상 소진일이 지난 상품은 이미 소진으로 표시하고 요약 카드에 몇 개인지 알린다', async () => {
    render(
      <AppProviders>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AppProviders>,
    )

    // 가짜 서버 예시: 케어트릿 120g은 3일 전, 연어 져키는 1일 전에 소진
    expect(await screen.findByText('3일 지남')).toBeInTheDocument()
    expect(screen.getByText('1일 지남')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /품절/ })).toHaveLength(2)

    const firstRow = screen.getAllByRole('row')[1]
    expect(firstRow).toHaveAttribute('data-passed')
    expect(firstRow).toHaveTextContent('케어트릿 120g')
    expect(
      screen.getByRole('tab', { name: /지금 넣어야 해요/ }),
    ).toHaveTextContent('2개는 이미 소진됐을 수 있어요')
  })

  it('계산 결과가 없으면 기준일 대신 계산 전 안내와 입고 조건 버튼을 보여준다', async () => {
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json(noResult(12)),
      ),
    )
    renderPage()

    expect(
      await screen.findByRole('heading', { name: '아직 계산한 결과가 없어요' }),
    ).toBeInTheDocument()
    expect(screen.getByText('기준일 없음')).toBeInTheDocument()
    expect(screen.getByText('아직 계산 전이에요')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '입고 조건 확인하기' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('갱신 전 결과예요')).not.toBeInTheDocument()
  })

  it('계산은 됐는데 넣을 상품이 없으면 빈 표 대신 안내와 수불부 올리기를 보여준다', async () => {
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json({
          ...noResult(12),
          asOfDate: '2026-11-01',
          daysSinceAsOf: 0,
          resultStatus: 'UP_TO_DATE',
          runId: 3,
          summary: { ...noResult(12).summary, notNeededCount: 158 },
        }),
      ),
    )
    renderPage()

    expect(
      await screen.findByText('지금 넣을 상품은 없어요'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/158개 상품 모두 다음 발주 주기까지 버텨요/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    expect(
      screen.getByRole('button', { name: '새 수불부 올리기' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /계산 불가/ }))
    expect(screen.getByText('계산 못 한 상품은 없어요.')).toBeInTheDocument()
  })

  // 11/5: 숫자 상자를 누르면 아래 판이 그 상자의 상품으로 바뀐다(맨 아래 따로 있던 칸은 없앰)
  it('숫자 상자를 누르면 그 상자의 상품 목록을 보여 주고 찾을 수 있다', async () => {
    const user = userEvent.setup()
    renderPage()

    const need = await screen.findByRole('tab', { name: /지금 넣어야 해요/ })
    expect(need).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('입고가 필요한 상품')

    await user.click(screen.getByRole('tab', { name: /계산 불가/ }))
    expect(screen.getByRole('tab', { name: /계산 불가/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      '판매 기록이 5일 쌓였어요',
    )
    // 자세한 계산 사유: 기간마다 판매한 날 칸(7칸 중 5칸)
    expect(
      screen.getByRole('img', { name: '판매한 날 5일, 7일 필요' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /지금 넣어야 해요/ }))
    await user.type(screen.getByLabelText('목록에서 상품 찾기'), '연어')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('연어 져키 80g')
  })

  it('고른 상품의 수량·사입비 합계를 보여 주고 발주 목록으로 받을 수 있다', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('checkbox', {
        name: '케어트릿 120g 발주 목록에 넣기',
      }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: '연어 져키 80g 발주 목록에 넣기' }),
    )
    const bar = screen.getByRole('region', { name: '발주 목록' })
    expect(bar).toHaveTextContent('2개 골랐어요 · 112개')
    expect(bar).toHaveTextContent('사입비 181,600원')
    expect(
      screen.getByRole('button', { name: '엑셀로 받기' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '선택 해제' }))
    expect(
      screen.queryByRole('region', { name: '발주 목록' }),
    ).not.toBeInTheDocument()
  })

  it('리드타임·품절 위험이 비어 오면 0일·0% 대신 미입력·자료 부족을 보여준다', async () => {
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json({
          ...noResult(12),
          asOfDate: '2026-11-01',
          daysSinceAsOf: 0,
          resultStatus: 'UP_TO_DATE',
          runId: 3,
          summary: { ...noResult(12).summary, needCount: 1 },
          items: [
            {
              productId: 1,
              resultId: 1,
              skuBarcode: '8800272420016',
              skuName: '케어트릿 120g',
              recommendedQty: 72,
              recommendedAmount: 129600,
              expectedShortageOn: null,
              leadTimeDays: null,
              preArrivalRisk: null,
            },
          ],
        }),
      ),
    )
    renderPage()

    const row = (
      await screen.findByRole('link', { name: '케어트릿 120g' })
    ).closest('tr')
    expect(row).toHaveTextContent('미입력')
    expect(row).toHaveTextContent('자료 부족')
    expect(row).not.toHaveTextContent('0일')
    expect(row).not.toHaveTextContent('0%')
  })

  it('마지막 업로드가 실패했으면 수불부 올리기를 끝낸 걸로 세지 않고 다시 올리게 한다', async () => {
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json(noResult(15)),
      ),
      http.get('/api/uploads/:uploadId', () =>
        HttpResponse.json({ uploadId: 15, status: 'FAILED' }),
      ),
    )
    renderPage()

    expect(await screen.findByText('아직 계산 전이에요')).toBeInTheDocument()
    expect(
      screen.getByText(
        '마지막으로 올린 수불부를 처리하지 못했어요. 파일을 확인하고 다시 올려 주세요.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '수불부 다시 올리기' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '입고 조건 확인하기' }),
    ).toBeNull()
    // 첫 단계(수불부 올리기)가 체크되지 않고 지금 단계로 남는다
    const steps = screen.getByRole('list', { name: '계산까지 순서' })
    expect(within(steps).getAllByRole('listitem')[0]).toHaveAttribute(
      'data-state',
      'now',
    )
  })

  it('마지막 업로드가 아직 처리 중이면 입고 조건이 아니라 그 업로드 확인으로 안내한다', async () => {
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json(noResult(15)),
      ),
      http.get('/api/uploads/:uploadId', () =>
        HttpResponse.json({ uploadId: 15, status: 'PROCESSING' }),
      ),
    )
    renderPage()

    expect(await screen.findByText('아직 계산 전이에요')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '확인 중인 업로드 보기' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '입고 조건 확인하기' }),
    ).toBeNull()
  })

  // 11/6 dev: 첫 업로드는 입고 조건 확정 전이라 계산이 안 붙어, 확인이 끝나도 "확인 중"에 멈춰 보였다
  it('확인 중이던 업로드가 끝나면 스스로 다시 불러와 입고 조건 확인으로 바뀐다', async () => {
    let status = 'PROCESSING'
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json(noResult(15)),
      ),
      http.get('/api/uploads/:uploadId', () =>
        HttpResponse.json({ uploadId: 15, status, runId: null }),
      ),
    )
    renderPage()

    expect(
      await screen.findByRole('button', { name: '확인 중인 업로드 보기' }),
    ).toBeInTheDocument()
    status = 'DONE'
    expect(
      await screen.findByRole(
        'button',
        { name: '입고 조건 확인하기' },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
  }, 10000)

  it('수불부를 아직 안 올렸으면 계산 전 안내의 버튼이 수불부 업로드다', async () => {
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json(noResult(null)),
      ),
    )
    renderPage()

    expect(await screen.findByText('아직 계산 전이에요')).toBeInTheDocument()
    expect(
      screen.getByText(
        '수불부를 올리고 입고 조건을 확인하면 권장 입고량이 나와요.',
      ),
    ).toBeInTheDocument()
    // 숫자가 없으니 "—" 카드는 숨기고, 업로드 버튼은 안내 카드에 하나만
    expect(screen.queryByLabelText('입고 예측 요약')).toBeNull()
    expect(
      screen.getAllByRole('button', { name: '수불부 업로드' }),
    ).toHaveLength(1)
    const steps = screen.getByRole('list', { name: '계산까지 순서' })
    expect(steps).toHaveTextContent('1수불부 올리기2입고 조건 확인3결과 보기')
    expect(screen.getByText('수불부 올리기')).toHaveAttribute(
      'aria-current',
      'step',
    )
  })
})

describe('주문까지 칸', () => {
  it('3주 남으면 세 칸을 채우고 마감일을 보여 준다', async () => {
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json({
          ...safeDashboard,
          today: '2026-11-01',
          notNeededItems: [
            {
              productId: 1,
              skuName: '여유상품',
              skuBarcode: '8800000000001',
              expectedShortageOn: '2026-11-25',
              leadTimeDays: 5,
            },
          ],
        }),
      ),
    )
    const { container } = renderSafe()
    await screen.findByText('여유상품')
    expect(
      screen.getByRole('columnheader', { name: /주문까지/ }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('주문까지 19일, 11월 20일까지')).toBeVisible()
    expect(container.querySelectorAll('i[data-on]')).toHaveLength(3)
    expect(screen.getByText('11/20까지')).toBeInTheDocument()
  })
})

describe('내 입고량 칸', () => {
  const needItem = (id: number, name: string, qty: number, amount: number) => ({
    productId: id,
    resultId: id,
    skuBarcode: `880000000000${id}`,
    skuName: name,
    recommendedQty: qty,
    recommendedAmount: amount,
    expectedShortageOn: '2026-11-20',
    leadTimeDays: 3,
    preArrivalRisk: 0.1,
  })
  const plan = (quantity: number, basis: string) => ({
    quantity,
    source: 'SCENARIO_80',
    decidedAt: '2026-11-05',
    basis,
  })

  afterEach(() => localStorage.clear())

  it('정한 상품은 수량과 날짜, 지난 계산 기준은 노란 꼬리표, 안 정한 상품은 —로 보여 준다', async () => {
    localStorage.setItem(
      'ipgo:planned-quantity',
      JSON.stringify({
        '1': plan(60, '2026. 11. 5'),
        '2': plan(30, '2026. 11. 1'),
      }),
    )
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json({
          ...noResult(12),
          asOfDate: '2026-11-05',
          daysSinceAsOf: 0,
          resultStatus: 'UP_TO_DATE',
          runId: 3,
          summary: { ...noResult(12).summary, needCount: 3 },
          items: [
            needItem(1, '케어트릿 120g', 72, 72000),
            needItem(2, '연어 져키 80g', 40, 40000),
            needItem(3, '덴탈껌 S', 10, 1000),
          ],
        }),
      ),
    )
    const user = userEvent.setup()
    renderPage()

    const row = (id: string) =>
      screen.getByRole('link', { name: id }).closest('tr') as HTMLElement
    await screen.findByRole('link', { name: '케어트릿 120g' })
    expect(
      screen.getByRole('columnheader', { name: '내 입고량' }),
    ).toBeVisible()
    // 현재 계산 기준: 60개 + "11/5 정함", 권장 72개에 취소선
    expect(row('케어트릿 120g')).toHaveTextContent('60개11/5 정함')
    expect(screen.getByText('72개')).toHaveAttribute('data-struck')
    // 지난 계산 기준: 노란 꼬리표, 권장 40개는 그대로
    expect(row('연어 져키 80g')).toHaveTextContent('⟲ 11/1 계산 기준')
    expect(screen.getByText('40개')).not.toHaveAttribute('data-struck')
    expect(
      within(row('덴탈껌 S')).getByRole('cell', { name: '—' }),
    ).toBeInTheDocument()

    // 고른 합계·사입비는 내 입고량 우선: 60개 × 1,000원 + 40개의 30개 × 1,000원
    await user.click(
      screen.getByRole('checkbox', { name: '케어트릿 120g 발주 목록에 넣기' }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: '연어 져키 80g 발주 목록에 넣기' }),
    )
    const bar = screen.getByRole('region', { name: '발주 목록' })
    expect(bar).toHaveTextContent('2개 골랐어요 · 90개')
    expect(bar).toHaveTextContent('사입비 90,000원')
  })
})
