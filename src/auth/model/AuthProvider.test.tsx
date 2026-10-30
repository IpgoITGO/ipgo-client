import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../app/providers/AppProviders'
import { routes } from '../../app/router/router'
import { server } from '../../mocks/server'
import { apiRequest, setAccessToken } from '../../shared/api/client'
import { signInAsSeller } from '../../test/signIn'
import { expireMockAccessTokens } from '../mocks/handlers'

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })

  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

describe('로그인 상태', () => {
  it('로그인하면 앱을 다시 열어도 리프레시 쿠키로 로그인이 유지된다', async () => {
    const user = userEvent.setup()
    const first = renderApp('/login')

    await signInAsSeller(user)
    expect(
      await screen.findByRole('heading', { name: /지금 넣어야 할 상품이 6개/ }),
    ).toBeInTheDocument()

    // 새로고침하면 메모리의 액세스 토큰은 사라지고 쿠키만 남습니다.
    first.unmount()
    setAccessToken(null)
    renderApp('/dashboard')

    expect(
      await screen.findByRole('heading', { name: /지금 넣어야 할 상품이 6개/ }),
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
      screen.queryByRole('heading', { name: /지금 넣어야 할 상품이 6개/ }),
    ).not.toBeInTheDocument()
  })
})

describe('로그인 시간 만료', () => {
  it('액세스 토큰이 만료되면 자동으로 갱신해 로그인을 이어 간다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await signInAsSeller(user)
    await screen.findByRole('heading', { name: /지금 넣어야 할 상품이 6개/ })

    expireMockAccessTokens()
    await act(() => apiRequest('/auth/me'))

    expect(
      screen.getByRole('heading', { name: /지금 넣어야 할 상품이 6개/ }),
    ).toBeInTheDocument()
  })

  it('갱신도 안 되면 로그인 화면으로 보내고 다시 로그인하라고 안내한다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await signInAsSeller(user)
    await screen.findByRole('heading', { name: /지금 넣어야 할 상품이 6개/ })

    // 7일이 지나 리프레시 쿠키까지 없어진 상황입니다.
    expireMockAccessTokens()
    document.cookie = 'mock_refresh=; path=/; max-age=0'
    await act(() => apiRequest('/auth/me').catch(() => undefined))

    expect(
      await screen.findByRole('heading', { name: '로그인' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      '로그인 시간이 끝났어요. 다시 로그인해 주세요.',
    )
  })
})

describe('로그아웃 실패 (#32)', () => {
  it('서버 로그아웃이 실패하면 로그인을 남겨 두고 팝업으로 알리고, 다시 시도해 성공하면 나간다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await signInAsSeller(user)
    await screen.findByRole('heading', { name: /지금 넣어야 할 상품이 6개/ })

    let fail = true
    server.use(
      http.post('/api/auth/logout', () =>
        fail
          ? HttpResponse.json(
              { code: 'INTERNAL_ERROR', message: '잠시 후' },
              { status: 500 },
            )
          : new HttpResponse(null, { status: 204 }),
      ),
    )
    await user.click(screen.getByRole('button', { name: '로그아웃' }))

    expect(
      await screen.findByRole('dialog', { name: '로그아웃을 끝내지 못했어요' }),
    ).toBeInTheDocument()
    // 아직 로그인 상태: 대시보드가 그대로 있다
    expect(
      screen.getByRole('heading', { name: /지금 넣어야 할 상품이 6개/ }),
    ).toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(
      await screen.findByRole('heading', { name: '로그인' }),
    ).toBeInTheDocument()
  })

  it('실패를 알고도 "그래도 나가기"를 고르면 이 화면에서만 로그인을 지운다', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await signInAsSeller(user)
    await screen.findByRole('heading', { name: /지금 넣어야 할 상품이 6개/ })

    server.use(http.post('/api/auth/logout', () => HttpResponse.error()))
    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    await user.click(
      await screen.findByRole('button', { name: '그래도 이 화면에서 나가기' }),
    )

    expect(
      await screen.findByRole('heading', { name: '로그인' }),
    ).toBeInTheDocument()
  })
})
