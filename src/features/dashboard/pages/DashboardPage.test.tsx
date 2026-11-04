import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { DashboardPage } from './DashboardPage'

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
      </MemoryRouter>
    </AppProviders>,
  )

describe('DashboardPage', () => {
  it('저장·업로드 뒤 계산 번호로 오면 계산 중이었다가 끝나면 결과 수를 알린다', async () => {
    renderWithRun(41)

    expect(await screen.findByText('새로 계산하고 있어요')).toBeInTheDocument()
    // mock은 두 번째 물음부터 끝(2초 간격)
    expect(
      await screen.findByText('계산이 끝났어요', {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('입고가 필요한 상품 6개 · 지금은 괜찮은 상품 22개'),
    ).toBeInTheDocument()
  })

  it('계산이 실패하면 이유와 이전 결과라는 안내, 다시 계산 버튼을 준다', async () => {
    renderWithRun(999)

    expect(await screen.findByText('계산하지 못했어요')).toBeInTheDocument()
    expect(
      screen.getByText(
        '계산 시간이 너무 오래 걸렸어요 · 아래는 이전 결과예요.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '입고 조건에서 다시 계산' }),
    ).toBeInTheDocument()
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
    expect(screen.getByText('판매한 날이 7일보다 적어요.')).toBeInTheDocument()
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
      screen.getByText('지금 넣어야 해요').closest('article'),
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
    expect(screen.getByText('계산 못 한 상품은 없어요.')).toBeInTheDocument()
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
