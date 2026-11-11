import { act, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '../../../mocks/server'
import { openApp } from '../../../test/openApp'
import { demoSubscription } from '../mocks/billingHandlers'
import type { Invoice, SessionResult } from '../model/billingApi'
import { openCardWindow } from '../model/cardWindow'

vi.mock('../model/cardWindow', () => ({ openCardWindow: vi.fn() }))

const declined: Invoice = {
  invoiceId: 'first-declined',
  planId: 'seller',
  amount: 49000,
  currency: 'KRW',
  periodStart: '2026-11-11T00:00:00Z',
  periodEnd: '2026-12-11T00:00:00Z',
  status: 'OPEN',
  paymentStatus: 'DECLINED',
  paidAt: null,
}
const session: SessionResult = {
  sessionId: 'completed',
  status: 'COMPLETED',
  invoiceId: declined.invoiceId,
  paymentStatus: 'SUCCEEDED',
  errorCode: null,
}
const callback =
  '/billing/auth/success?sessionId=completed&state=x&authKey=a&customerKey=c'

function invoices(items: Invoice[]) {
  server.use(
    http.get('/api/billing/invoices', () =>
      HttpResponse.json({ items, nextCursor: null }),
    ),
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(openCardWindow).mockReset()
})

describe('최초 승인 거절 후 기존 청구 재결제', () => {
  it.each(['trial', 'trial-ended'] as const)(
    '%s에서도 새 구독 대신 기존 청구를 한 번 재시도한다',
    async (demo) => {
      server.use(
        http.get('/api/billing/subscription', () =>
          HttpResponse.json(demoSubscription(demo)),
        ),
      )
      invoices([declined])
      const retry = vi.fn(({ request }: { request: Request }) => {
        expect(request.headers.get('Idempotency-Key')).toMatch(
          /^[A-Za-z0-9_-]{8,100}$/,
        )
        return HttpResponse.json(
          { invoiceId: declined.invoiceId },
          { status: 202 },
        )
      })
      const start = vi.fn(() => HttpResponse.json({}, { status: 409 }))
      server.use(
        http.post('/api/billing/invoices/:id/retry', retry),
        http.post('/api/billing/registration-sessions', start),
      )
      const { user } = await openApp('/account')
      await user.click(await screen.findByRole('button', { name: '다시 결제' }))
      expect(
        await screen.findByText(/다시 결제를 요청했어요/),
      ).toBeInTheDocument()
      expect(retry).toHaveBeenCalledOnce()
      expect(new URL(retry.mock.calls[0][0].request.url).pathname).toBe(
        '/api/billing/invoices/first-declined/retry',
      )
      expect(start).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['OPEN', 'UNKNOWN'],
    ['OPEN', 'REVIEW_REQUIRED'],
    ['OPEN', 'READY'],
    ['PAID', 'DECLINED'],
    ['VOID', 'DECLINED'],
  ])('%s/%s 청구는 재결제하지 않는다', async (status, paymentStatus) => {
    invoices([{ ...declined, status, paymentStatus }])
    await openApp('/account')
    await screen.findByRole('table')
    await screen.findByText('49,000원')
    expect(
      screen.queryByRole('button', { name: '다시 결제' }),
    ).not.toBeInTheDocument()
  })

  it('카드 교체를 마친 체험 계정에서도 같은 미납 청구를 재시도한다', async () => {
    invoices([declined])
    server.use(
      http.get('/api/billing/payment-methods', () =>
        HttpResponse.json([
          {
            id: 1,
            maskedNumber: '433012******1234',
            current: true,
            status: 'ACTIVE',
          },
        ]),
      ),
      http.get('/api/billing/registration-sessions/:id', () =>
        HttpResponse.json({ ...session, invoiceId: null, paymentStatus: null }),
      ),
    )
    server.use(
      http.post('/api/billing/registration-sessions/:id/complete', () =>
        HttpResponse.json(
          { ...session, invoiceId: null, paymentStatus: null },
          { status: 202 },
        ),
      ),
    )
    vi.mocked(openCardWindow).mockResolvedValue({ redirect: callback })
    const retry = vi.fn(() => HttpResponse.json({}, { status: 202 }))
    server.use(http.post('/api/billing/invoices/first-declined/retry', retry))
    const { user } = await openApp('/account')
    await user.click(await screen.findByRole('button', { name: '바꾸기' }))
    await screen.findByRole('heading', { name: '카드를 바꿨어요' })
    await user.click(screen.getByRole('button', { name: '내 계정으로' }))
    await user.click(await screen.findByRole('button', { name: '다시 결제' }))
    await screen.findByText(/다시 결제를 요청했어요/)
    expect(retry).toHaveBeenCalledOnce()
    expect(openCardWindow).toHaveBeenCalledOnce()
  })

  it('최초 결제 거절 복귀 화면은 새 checkout 대신 내 계정으로 안내한다', async () => {
    invoices([declined])
    sessionStorage.setItem('ipgo:billing-return', '/checkout?plan=seller')
    server.use(
      http.post('/api/billing/registration-sessions/:id/complete', () =>
        HttpResponse.json({}, { status: 202 }),
      ),
      http.get('/api/billing/registration-sessions/:id', () =>
        HttpResponse.json({ ...session, paymentStatus: 'DECLINED' }),
      ),
    )
    const { user } = await openApp(callback)
    await user.click(
      await screen.findByRole('button', { name: '내 계정에서 다시 결제' }),
    )
    await screen.findByRole('button', { name: '다시 결제' })
    expect(screen.getByRole('heading', { name: '내 계정' })).toBeInTheDocument()
  })
})

describe('등록 완료 응답 유실 후 같은 세션으로 결과 확인', () => {
  it.each(['network', 'server'] as const)(
    '%s 오류 후 성공 조회로 복구하고 complete는 재전송하지 않는다',
    async (error) => {
      const complete = vi.fn(() =>
        error === 'network'
          ? HttpResponse.error()
          : HttpResponse.json(
              { code: 'INTERNAL_SERVER_ERROR', message: 'error' },
              { status: 500 },
            ),
      )
      const getSession = vi.fn(() => HttpResponse.json(session))
      server.use(
        http.post('/api/billing/registration-sessions/:id/complete', complete),
        http.get('/api/billing/registration-sessions/completed', getSession),
      )
      await openApp(callback)
      expect(
        await screen.findByRole('heading', { name: '결제됐어요' }),
      ).toBeInTheDocument()
      expect(getSession).toHaveBeenCalledOnce()
      expect(complete).toHaveBeenCalledOnce()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('응답 유실 후 조회가 확정 거절이면 거절을 표시한다', async () => {
    server.use(
      http.post('/api/billing/registration-sessions/:id/complete', () =>
        HttpResponse.error(),
      ),
      http.get('/api/billing/registration-sessions/:id', () =>
        HttpResponse.json({
          ...session,
          paymentStatus: 'DECLINED',
          errorCode: 'LIMIT_EXCEEDED',
        }),
      ),
    )
    await openApp(callback)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '카드 한도가 부족해요',
    )
    expect(screen.queryByText('결제됐어요')).not.toBeInTheDocument()
  })

  it.each(['UNKNOWN', 'REVIEW_REQUIRED', 'unavailable'])(
    '%s이면 조회를 종료하고 실패나 재결제를 안내하지 않는다',
    async (paymentStatus) => {
      const complete = vi.fn(() => HttpResponse.error())
      const getSession = vi.fn(() =>
        paymentStatus === 'unavailable'
          ? HttpResponse.error()
          : HttpResponse.json({ ...session, paymentStatus }),
      )
      server.use(
        http.post('/api/billing/registration-sessions/:id/complete', complete),
        http.get('/api/billing/registration-sessions/:id', getSession),
      )
      const { router } = await openApp('/plans')
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      await act(() => router.navigate(callback))
      await act(async () => {
        await vi.waitFor(() => expect(getSession).toHaveBeenCalled())
        for (let i = 0; i < 47; i++) {
          await vi.advanceTimersByTimeAsync(2000)
        }
      })
      vi.useRealTimers()
      await waitFor(() =>
        expect(screen.getByText(/결제를 아직 확인/)).toBeInTheDocument(),
      )
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: '다시 시도' }),
      ).not.toBeInTheDocument()
      expect(complete).toHaveBeenCalledOnce()
      expect(getSession).toHaveBeenCalledTimes(46)
    },
  )
})
