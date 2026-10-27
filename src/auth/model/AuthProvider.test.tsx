import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../app/providers/AppProviders'
import { routes } from '../../app/router/router'
import { signInAsSeller } from '../../test/signIn'

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })

  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

describe('로그인 상태', () => {
  it('로그인하면 앱을 다시 열어도 로그인이 유지된다', async () => {
    const user = userEvent.setup()
    const first = renderApp('/login')

    await signInAsSeller(user)
    expect(
      await screen.findByRole('heading', { name: '대시보드' }),
    ).toBeInTheDocument()

    first.unmount()
    renderApp('/dashboard')

    expect(
      await screen.findByRole('heading', { name: '대시보드' }),
    ).toBeInTheDocument()
  })

  it('로그아웃하면 서버 세션도 끝나서 다시 열면 로그인 화면이 나온다', async () => {
    const user = userEvent.setup()
    const first = renderApp('/login')

    await signInAsSeller(user)
    await user.click(await screen.findByRole('button', { name: '로그아웃' }))
    expect(
      await screen.findByRole('heading', { name: '로그인' }),
    ).toBeInTheDocument()

    first.unmount()
    renderApp('/dashboard')

    expect(
      await screen.findByRole('heading', { name: '로그인' }),
    ).toBeInTheDocument()
  })

  it('틀린 비밀번호로는 로그인하지 않고 안내 문구를 보여준다', async () => {
    const user = userEvent.setup()
    renderApp('/login')

    await user.type(await screen.findByLabelText('이메일'), 'seller@a.com')
    await user.type(screen.getByLabelText('비밀번호'), 'wrong1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '이메일 또는 비밀번호가 맞지 않아요.',
    )
    expect(
      screen.queryByRole('heading', { name: '대시보드' }),
    ).not.toBeInTheDocument()
  })
})
