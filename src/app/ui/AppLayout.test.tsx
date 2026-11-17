import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { demoSubscription } from '../../features/billing/mocks/billingHandlers'
import { openApp } from '../../test/openApp'

import { server } from '../../mocks/server'
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

  it('수불부를 올리기 전에는 입고 조건 메뉴를 잠그고 주소로 들어와도 대시보드로 돌려보낸다', async () => {
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json({
          asOfDate: null,
          today: '2026-11-15',
          daysSinceAsOf: null,
          resultStatus: null,
          runId: null,
          resultComputedAt: null,
          lastFailedRunAt: null,
          latestUploadId: null,
          summary: {
            needCount: 0,
            notNeededCount: 0,
            notCalculableCount: 0,
            excludedCount: 0,
          },
          items: [],
          notCalculable: [],
          excluded: [],
        }),
      ),
    )
    const user = userEvent.setup()
    const router = createMemoryRouter(routes, { initialEntries: ['/login'] })
    render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    )
    await signInAsSeller(user)

    const locked = await screen.findByRole('button', { name: '입고 조건' })
    expect(locked).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('link', { name: '입고 조건' })).toBeNull()

    await router.navigate('/settings')
    expect(
      await screen.findByText('수불부를 먼저 올려 주세요'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
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
