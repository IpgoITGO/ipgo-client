import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { RouteToast } from '../../../app/ui/RouteToast'
import { DashboardPage } from '../../dashboard/pages/DashboardPage'
import { SettingsPage } from './SettingsPage'

describe('SettingsPage', () => {
  it('확인하고 계산하기가 저장되면 대시보드로 가서 토스트를 보여준다', async () => {
    const user = userEvent.setup()
    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route element={<SettingsPage />} path="/settings" />
            <Route element={<DashboardPage />} path="/dashboard" />
          </Routes>
          <RouteToast />
        </MemoryRouter>
      </AppProviders>,
    )

    await screen.findByText('케어트릿 120g')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))

    expect(
      await screen.findByText('입고 조건을 저장했어요'),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: /지금 넣어야 할 상품이 6개/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '확인하고 계산하기' }),
    ).toBeNull()
  })

  it('상품을 검색하고 잘못된 입고 단위를 차단한다', async () => {
    const user = userEvent.setup()
    render(
      <AppProviders>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </AppProviders>,
    )

    expect(await screen.findByText('케어트릿 120g')).toBeInTheDocument()
    await user.type(screen.getByLabelText('상품명 또는 바코드 검색'), '덴탈껌')
    const productSection = screen
      .getByRole('heading', { name: '상품별로 다른 조건' })
      .closest('section')
    expect(productSection).not.toBeNull()
    expect(
      within(productSection!).getByText('덴탈껌 S 10입'),
    ).toBeInTheDocument()
    expect(
      within(productSection!).queryByText('케어트릿 120g'),
    ).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('덴탈껌 S 10입 inboundUnit'))
    await user.type(screen.getByLabelText('덴탈껌 S 10입 inboundUnit'), '0')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('1 이상의 정수')
  })
})
