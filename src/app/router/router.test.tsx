import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { signInAsSeller } from '../../test/signIn'
import { AppProviders } from '../providers/AppProviders'
import { routes } from './router'

describe('app router', () => {
  it('보호된 route를 로그인으로 보내고 로그인 후 대시보드로 간다', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(routes, {
      initialEntries: ['/dashboard'],
    })

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )

    expect(
      await screen.findByRole('heading', { name: '로그인' }),
    ).toBeInTheDocument()

    await signInAsSeller(user)

    expect(
      await screen.findByRole('heading', {
        name: '지금 넣어야 할 상품이 6개 있어요',
      }),
    ).toBeInTheDocument()
  })

  it('다른 화면에서 로그인으로 보내져도 로그인하면 대시보드로 간다', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(routes, {
      initialEntries: ['/settings'],
    })

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )

    expect(
      await screen.findByRole('heading', { name: '로그인' }),
    ).toBeInTheDocument()

    await signInAsSeller(user)

    expect(
      await screen.findByRole('heading', {
        name: '지금 넣어야 할 상품이 6개 있어요',
      }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
  })
})
