import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../app/providers/AppProviders'
import { routes } from '../../app/router/router'

function renderLogin() {
  const router = createMemoryRouter(routes, { initialEntries: ['/login'] })

  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

describe('LoginPage', () => {
  it('로그인 탭이 현재 화면으로 표시되고 회원가입 탭이 있다', async () => {
    renderLogin()

    expect(await screen.findByRole('link', { name: '로그인' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute(
      'href',
      '/signup',
    )
    expect(
      screen.getByRole('heading', { name: '다시 오신 걸 환영해요' }),
    ).toBeInTheDocument()
  })

  it('빈 칸으로 로그인하면 칸마다 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(await screen.findByRole('button', { name: '로그인' }))

    expect(
      await screen.findByText('올바른 이메일 주소를 입력해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('비밀번호를 입력해 주세요.')).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })
})
