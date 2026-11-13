import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../../mocks/server'
import { openApp } from '../../../test/openApp'
import { demoSubscription } from '../mocks/billingHandlers'
import type { ServerPlan } from '../model/billingApi'

function reusedTrial() {
  const subscription = demoSubscription('trial-ended')
  server.use(
    http.get('/api/billing/subscription', () =>
      HttpResponse.json({
        ...subscription,
        trialEnd: null,
        entitlements: {
          ...subscription.entitlements,
          reason: 'TRIAL_ALREADY_USED',
        },
      }),
    ),
  )
}

describe('재가입 체험 제한 안내', () => {
  it.each(['MONTH', 'ONE_TIME'] as const)(
    '내 계정은 %s에서도 체험 재사용 사유와 결제 경로를 보여 준다',
    async (interval) => {
      reusedTrial()
      server.use(
        http.get('/api/billing/plans', () =>
          HttpResponse.json([
            {
              planId: 'seller',
              priceVersion: 'seller-v1',
              amount: 49000,
              currency: 'KRW',
              interval,
              products: 300,
              monthlyInsights: 100,
              testMode: true,
              trialDays: 14,
              consentVersion: 'test-consent',
            } satisfies ServerPlan,
          ]),
        ),
      )
      const { user, router } = await openApp('/account')
      const plan = await screen.findByRole('region', { name: '지금 요금제' })
      await within(plan).findByText(
        '이전에 무료 체험을 쓴 이메일이에요. 결제 후 이용할 수 있어요.',
      )
      expect(screen.queryByText('이용 기간이 끝났어요')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('meter', { name: /^체험/ }),
      ).not.toBeInTheDocument()
      await user.click(
        within(plan).getByRole('link', { name: '요금제 고르기' }),
      )
      expect(router.state.location.pathname).toBe('/plans')
    },
  )

  it('요금제에서 새 체험을 제안하지 않고 유료 결제로 이동한다', async () => {
    reusedTrial()
    const { user, router } = await openApp('/plans')
    const status = await screen.findByRole('region', { name: '지금 상태' })
    expect(status).toHaveTextContent(
      '이전에 무료 체험을 쓴 이메일이에요. 결제 후 이용할 수 있어요.',
    )
    expect(status).not.toHaveTextContent('체험이 끝났어요')
    expect(status).not.toHaveTextContent('D-')
    const cards = screen.getByRole('list', { name: '요금제' })
    expect(
      within(cards).getByRole('button', { name: '체험 재사용 불가' }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: '14일 체험으로 시작' }),
    ).not.toBeInTheDocument()
    await user.click(
      within(cards).getByRole('button', { name: '셀러로 시작하기' }),
    )
    expect(router.state.location.pathname).toBe('/checkout')
    expect(router.state.location.search).toBe('?plan=seller')
  })
})
