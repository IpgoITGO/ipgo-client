import { act, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { login } from '../../../auth/api/authApi'
import { AppProviders } from '../../../app/providers/AppProviders'
import { routes } from '../../../app/router/router'

vi.mock('../model/signupPolicy', async () => ({
  signupPolicy: (await import('../model/fixtures/signup-policy.json')).default,
}))

describe('공개 약관·처리방침', () => {
  it('로그인 후 앱 공통 링크에서도 전문을 연다', async () => {
    await login({ email: 'seller@a.com', password: 'pass1234' })
    const router = createMemoryRouter(routes, {
      initialEntries: ['/dashboard'],
    })
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )
    expect(
      await screen.findByRole('link', { name: '이용약관' }),
    ).toHaveAttribute('href', '/terms')
    expect(
      screen.getByRole('link', { name: '개인정보 처리방침' }),
    ).toHaveAttribute('target', '_blank')
  })
  it.each([false, true])(
    '로그인 상태가 %s여도 두 전문을 읽을 수 있다',
    async (signedIn) => {
      if (signedIn) await login({ email: 'seller@a.com', password: 'pass1234' })
      const router = createMemoryRouter(routes, { initialEntries: ['/terms'] })
      const view = render(
        <AppProviders>
          <RouterProvider router={router} />
        </AppProviders>,
      )
      await waitFor(() =>
        expect(screen.getByText(/합성 이용약관 전문/)).toBeVisible(),
      )
      expect(router.state.location.pathname).toBe('/terms')
      await act(() => router.navigate('/privacy'))
      await waitFor(() =>
        expect(screen.getByText(/합성 개인정보 처리방침 전문/)).toBeVisible(),
      )
      expect(router.state.location.pathname).toBe('/privacy')
      view.unmount()
    },
  )

  it('로그인 전후 공통 링크는 새 탭에서 문서를 열어 입력을 보존한다', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/login'] })
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )
    expect(
      await screen.findByRole('link', { name: '이용약관' }),
    ).toHaveAttribute('href', '/terms')
    expect(
      screen.getByRole('link', { name: '개인정보 처리방침' }),
    ).toHaveAttribute('target', '_blank')
  })
})
