import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { AppProviders } from '../app/providers/AppProviders'
import { routes } from '../app/router/router'
import { signInAsSeller } from './signIn'

// 시험 계정으로 로그인한 뒤 원하는 주소로 간다(결제·계정 화면 시험용).
export async function openApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: ['/login'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  const user = userEvent.setup()
  await signInAsSeller(user)
  await screen.findByRole('button', { name: /계정 메뉴/ })
  await act(() => router.navigate(path))
  return { user, router }
}
