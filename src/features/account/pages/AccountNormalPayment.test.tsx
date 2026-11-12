import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../../mocks/server'
import { openApp } from '../../../test/openApp'
import {
  applyMockDemo,
  demoSubscription,
} from '../../billing/mocks/billingHandlers'

describe('일반결제 이용권의 계정 화면', () => {
  it.each([false, true])(
    '요금제 응답 지연=%s여도 해지 취소를 표시하지 않고 결제 환불은 제공한다',
    async (delayed) => {
      applyMockDemo('seller')
      let release!: () => void
      const ready = new Promise<void>((resolve) => {
        release = resolve
      })
      server.use(
        http.get('/api/billing/payments', () => HttpResponse.json([])),
        http.get('/api/billing/subscription', () =>
          HttpResponse.json({
            ...demoSubscription('seller'),
            cancelAtPeriodEnd: true,
            nextChargeAt: null,
          }),
        ),
        http.get('/api/billing/plans', async () => {
          if (delayed) await ready
          return HttpResponse.json([
            {
              planId: 'seller',
              priceVersion: 'seller-v1',
              amount: 49000,
              currency: 'KRW',
              interval: 'ONE_TIME',
              products: 300,
              monthlyInsights: 100,
              testMode: true,
              trialDays: 14,
              consentVersion: 'one-time-month-2026-11-v1',
            },
          ])
        }),
      )
      const { user } = await openApp('/account')
      try {
        await screen.findByText('셀러 · 결제됨')
        expect(
          screen.queryByRole('button', { name: '해지 취소' }),
        ).not.toBeInTheDocument()
      } finally {
        await act(async () => release())
      }
      await screen.findByText(/1개월 이용권 · 자동 청구 없음/)
      expect(
        screen.queryByRole('button', { name: '해지 취소' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: '구독 해지' }),
      ).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '결제 취소·환불' }))
      expect(screen.getByRole('dialog')).toHaveTextContent(
        '취소가 확인되면 유료 이용이 종료됩니다.',
      )
      expect(screen.getByRole('dialog')).not.toHaveTextContent(
        '다음 자동 청구도 중지됩니다.',
      )
    },
  )
})
