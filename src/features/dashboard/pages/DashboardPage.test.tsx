import { render, screen } from '@testing-library/react'
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

describe('DashboardPage', () => {
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
  })
})
