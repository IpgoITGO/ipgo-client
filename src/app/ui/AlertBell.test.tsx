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
})
