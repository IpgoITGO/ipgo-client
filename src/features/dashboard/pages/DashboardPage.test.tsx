import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '../../../app/providers/AppProviders'
import { DashboardPage } from './DashboardPage'

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
})
