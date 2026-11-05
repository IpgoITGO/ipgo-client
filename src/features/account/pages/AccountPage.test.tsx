import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { routes } from '../../../app/router/router'
import { signInAsSeller } from '../../../test/signIn'
import { loadSubscription, subscribe } from '../../billing/model/billing'

function renderApp() {
  const router = createMemoryRouter(routes, { initialEntries: ['/login'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

describe('내 계정', () => {
  beforeEach(() => localStorage.clear())

  it('이름 메뉴로 들어가고, Esc로 닫힌다', async () => {
    const user = userEvent.setup()
    renderApp()
    await signInAsSeller(user)
    const trigger = await screen.findByRole('button', { name: /계정 메뉴/ })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    await user.click(screen.getByRole('link', { name: '내 계정' }))
    expect(
      await screen.findByRole('heading', { name: '내 계정' }),
    ).toBeInTheDocument()
    // 화면이 바뀌면 메뉴는 닫힌다
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('14일 체험 시작')).toBeInTheDocument()
    expect(screen.getByText('seller@a.com')).toBeInTheDocument()
  })

  it('유료면 해지를 한 번 더 묻고, 다음 결제일까지 쓴다고 보여 준다', async () => {
    subscribe(
      loadSubscription(new Date(2026, 10, 5)),
      'seller',
      'card',
      new Date(2026, 10, 5),
    )
    const user = userEvent.setup()
    renderApp()
    await signInAsSeller(user)
    await user.click(await screen.findByRole('button', { name: /계정 메뉴/ }))
    await user.click(screen.getByRole('link', { name: '내 계정' }))
    expect(await screen.findByText('12월 5일 · 49,000원')).toBeInTheDocument()
    expect(screen.getByText('카드(KG이니시스)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '구독 해지' }))
    await user.click(screen.getByRole('button', { name: '해지하기' }))
    expect(screen.getByText('12월 5일에 끝나요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '해지 취소' }))
    expect(screen.getByText('12월 5일 · 49,000원')).toBeInTheDocument()
  })
})
