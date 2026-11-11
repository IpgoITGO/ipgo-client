import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { routes } from '../../../app/router/router'
import { signInAsSeller } from '../../../test/signIn'

describe('회원 탈퇴', () => {
  beforeEach(() => localStorage.clear())

  it('링크 → 1단계 → 비밀번호 틀림 → 맞으면 로그아웃·로그인 화면·안내', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(routes, { initialEntries: ['/login'] })
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )
    await signInAsSeller(user)
    await user.click(await screen.findByRole('button', { name: /계정 메뉴/ }))
    await user.click(screen.getByRole('link', { name: '내 계정' }))
    await user.click(await screen.findByRole('button', { name: '회원 탈퇴' }))

    const title = await screen.findByRole('heading', {
      name: '탈퇴하면 아래 자료가 모두 지워져요',
    })
    expect(title).toHaveFocus()
    expect(screen.getByText('올린 수불부')).toBeInTheDocument()

    const field = screen.getByLabelText('확인을 위해 비밀번호를 넣어 주세요')
    await user.click(field)
    await user.paste('wrong1234')
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }))
    expect(
      await screen.findByText('비밀번호가 맞지 않아요.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('지운 자료는 되살릴 수 없어요.'),
    ).toBeInTheDocument()

    await user.clear(field)
    await user.paste('pass1234')
    await user.click(screen.getByRole('button', { name: '탈퇴하기' }))
    await screen.findByRole('button', { name: '로그인' })
    expect(router.state.location.pathname).toBe('/login')
    // 로그인 화면의 RouteToast가 안내를 띄운다
    expect(
      await screen.findByText(
        '탈퇴했어요. 그동안 고마웠어요',
        {},
        // 한꺼번에 돌릴 때 느려도 안내가 뜰 때까지 기다린다
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
    // 로그인부터 탈퇴까지 한 번에 도는 긴 흐름이라 전체 실행 때 5초를 넘길 수 있다
  }, 20_000)
})
