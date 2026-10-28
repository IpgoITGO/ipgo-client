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
    await user.selectOptions(
      screen.getByLabelText('입고 필요 목록 정렬'),
      'cost',
    )
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('케어트릿 120g')
  })
})
