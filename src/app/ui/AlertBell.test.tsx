import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { signInAsSeller } from '../../test/signIn'
import { AppProviders } from '../providers/AppProviders'
import { routes } from '../router/router'

describe('AlertBell', () => {
  it('종을 열면 목록이 보이고 Esc로 닫으면 종으로 포커스가 돌아온다', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(routes, { initialEntries: ['/login'] })
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )
    await signInAsSeller(user)

    const bell = await screen.findByRole('button', { name: /^알림 \d+개$/ })
    expect(bell).toHaveAttribute('aria-expanded', 'false')
    await user.click(bell)
    expect(bell).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('button', { name: '모두 읽음' }),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(bell).toHaveAttribute('aria-expanded', 'false')
    expect(bell).toHaveFocus()
  })

  it('종류별로 묶어 보이고, × 하나·모두 지우기로 목록에서 지운다(11/13)', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(routes, { initialEntries: ['/login'] })
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )
    await signInAsSeller(user)
    await user.click(
      await screen.findByRole('button', { name: /^알림 [1-9]\d*개$/ }),
    )
    const stock = await screen.findByRole('region', {
      name: /^품절 위험 \d+개$/,
    })
    const before = Number(stock.getAttribute('aria-label')?.match(/\d+/)?.[0])

    await user.click(screen.getAllByRole('button', { name: /알림 지우기$/ })[0])
    expect(
      screen.getByRole('region', { name: `품절 위험 ${before - 1}개` }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '모두 지우기' }))
    expect(screen.getByText('새 알림이 없어요')).toBeInTheDocument()
  })
})
