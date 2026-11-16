import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'

import { server } from '../../mocks/server'
import { demoSubscription } from '../../features/billing/mocks/billingHandlers'
import { openApp } from '../../test/openApp'

import { clickSignOut, signInAsSeller } from '../../test/signIn'
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

    await signInAsSeller(user)

    expect(
      await screen.findByRole('link', { name: '대시보드' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      await screen.findByRole('button', {
        name: '박셀러 · 펫스낵랩 계정 메뉴',
      }),
    ).toBeInTheDocument()

    await clickSignOut(user)

    expect(
      await screen.findByRole('heading', { name: '로그인' }),
    ).toBeInTheDocument()
  })
})

describe('상단 요금제 표시', () => {
  it.each(['status', 'reason'])(
    '미선택 %s이면 요금제를 고르도록 안내한다',
    async (signal) => {
      const subscription = demoSubscription('trial')
      server.use(
        http.get('/api/billing/subscription', () =>
          HttpResponse.json({
            ...subscription,
            status: signal === 'status' ? 'NOT_SELECTED' : 'TRIALING',
            trialEnd: null,
            entitlements: {
              ...subscription.entitlements,
              reason: signal === 'reason' ? 'PLAN_NOT_SELECTED' : null,
            },
          }),
        ),
      )
      const { user, router } = await openApp('/dashboard')
      const pill = await screen.findByRole('link', {
        name: '지금 요금제: 요금제 고르기',
      })
      expect(pill).toHaveAttribute('href', '/plans')
      expect(screen.queryByText('체험 0일 남음')).not.toBeInTheDocument()
      await user.click(pill)
      expect(router.state.location.pathname).toBe('/plans')
    },
  )

  it('체험 선택 후에는 남은 14일을 표시한다', async () => {
    const subscription = demoSubscription('trial')
    const end = new Date()
    end.setDate(end.getDate() + 14)
    server.use(
      http.get('/api/billing/subscription', () =>
        HttpResponse.json({ ...subscription, trialEnd: end.toISOString() }),
      ),
    )
    await openApp('/dashboard')
    expect(
      await screen.findByRole('link', { name: '지금 요금제: 체험 14일 남음' }),
    ).toBeInTheDocument()
  })
})
