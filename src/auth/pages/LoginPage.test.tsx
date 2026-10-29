import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../app/providers/AppProviders'
import { routes } from '../../app/router/router'
import { server } from '../../mocks/server'

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

  it('회원가입을 마치고 오면 안내 문구를 보여주고 이메일을 미리 채운다', async () => {
    const router = createMemoryRouter(routes, {
      initialEntries: [
        { pathname: '/login', state: { signedUp: 'new@b.com' } },
      ],
    })
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )

    expect(
      await screen.findByText('가입을 마쳤어요. 로그인해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toHaveValue('new@b.com')
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

  it('서버에 연결하지 못하면 비밀번호 오류와 다른 문구를 보여준다', async () => {
    // 가짜 서버가 안 붙어 보안 토큰 요청에 홈페이지 HTML이 돌아오는 경우
    server.use(
      http.get('/api/auth/csrf', () => HttpResponse.html('<html></html>')),
    )
    const user = userEvent.setup()
    renderLogin()

    await user.type(await screen.findByLabelText('이메일'), 'seller@a.com')
    await user.type(screen.getByLabelText('비밀번호'), 'pass1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '서버에 연결하지 못했어요',
    )
    expect(
      screen.queryByText('이메일 또는 비밀번호가 맞지 않아요.'),
    ).not.toBeInTheDocument()
  })
})
