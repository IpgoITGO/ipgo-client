import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../providers/AppProviders'
import { routes } from '../router/router'

describe('AppLayout', () => {
  it('현재 메뉴를 표시하고 로그아웃하면 로그인으로 이동한다', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(routes, { initialEntries: ['/login'] })

    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )

    await user.click(await screen.findByRole('button', { name: '로그인' }))

    expect(
      await screen.findByRole('link', { name: '대시보드' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      await screen.findByLabelText('박셀러 · 펫스낵랩'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '로그아웃' }))

    expect(
      await screen.findByRole('heading', { name: '로그인' }),
    ).toBeInTheDocument()
  })
})
