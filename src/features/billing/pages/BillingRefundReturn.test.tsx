import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../../../mocks/server'
import { openApp } from '../../../test/openApp'
import { demoSubscription } from '../mocks/billingHandlers'

const session = {
  sessionId: 'past',
  status: 'COMPLETED',
  invoiceId: 'paid',
  paymentStatus: 'SUCCEEDED',
  errorCode: null,
}
const invoice = {
  invoiceId: 'paid',
  status: 'PAID',
  paymentStatus: 'SUCCEEDED',
  refundStatus: null,
}
function arrange(items: object[], nextCursor: string | null = null) {
  const complete = vi.fn(() => HttpResponse.json({}, { status: 202 }))
  server.use(
    http.get('/api/billing/registration-sessions/past', () =>
      HttpResponse.json(session),
    ),
    http.post('/api/billing/registration-sessions/:id/complete', complete),
    http.get('/api/billing/invoices', () =>
      HttpResponse.json({ items, nextCursor }),
    ),
  )
  return complete
}

describe('과거 성공 세션의 현재 청구·환불 상태', () => {
  it('실제 환불 저장 상태 VOID/CANCELED가 세션 SUCCEEDED보다 우선한다', async () => {
    const complete = arrange([
      { ...invoice, status: 'VOID', refundStatus: 'CANCELED' },
    ])
    server.use(
      http.get('/api/billing/subscription', () =>
        HttpResponse.json({
          ...demoSubscription('seller'),
          status: 'CANCELED',
        }),
      ),
    )
    await openApp('/billing/auth/success?sessionId=past')
    expect(await screen.findByText('결제가 취소됐어요')).toBeInTheDocument()
    expect(screen.queryByText('결제됐어요')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /다시/ }),
    ).not.toBeInTheDocument()
    expect(complete).not.toHaveBeenCalled()
  })

  it.each(['PROCESSING', 'UNKNOWN', 'ACCOUNT_REQUIRED', 'REVIEW_REQUIRED'])(
    '환불 %s는 성공 대신 확인 중으로 안내한다',
    async (refundStatus) => {
      const complete = arrange([{ ...invoice, refundStatus }])
      await openApp('/billing/auth/success?sessionId=past')
      expect(
        await screen.findByText(/취소·환불 상태를 확인하고 있어요/),
      ).toBeInTheDocument()
      expect(screen.queryByText('결제됐어요')).not.toBeInTheDocument()
      expect(complete).not.toHaveBeenCalled()
    },
  )

  it.each(['CANCELED', 'ACTIVE'])(
    '구독 %s만으로 정상 과거 청구를 실패로 바꾸지 않는다',
    async (status) => {
      arrange([invoice])
      server.use(
        http.get('/api/billing/subscription', () =>
          HttpResponse.json({
            ...demoSubscription('seller'),
            status,
            cancelAtPeriodEnd: true,
          }),
        ),
      )
      await openApp('/billing/auth/success?sessionId=past')
      expect(await screen.findByText('결제됐어요')).toBeInTheDocument()
    },
  )

  it('다음 페이지의 해당 청구까지 확인한다', async () => {
    arrange([])
    const read = vi.fn(({ request }: { request: Request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.has('cursor')
          ? { items: [invoice], nextCursor: null }
          : {
              items: [{ ...invoice, invoiceId: 'unrelated', status: 'VOID' }],
              nextCursor: 'older',
            },
      ),
    )
    server.use(http.get('/api/billing/invoices', read))
    await openApp('/billing/auth/success?sessionId=past')
    expect(await screen.findByText('결제됐어요')).toBeInTheDocument()
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('서로 다른 다음 cursor도 20페이지에서 멈추고 미확인으로 남긴다', async () => {
    const complete = arrange([])
    let pages = 0
    const read = vi.fn(() => {
      pages += 1
      return HttpResponse.json({
        items: [],
        nextCursor: pages < 21 ? `older-${pages}` : null,
      })
    })
    server.use(http.get('/api/billing/invoices', read))
    await openApp('/billing/auth/success?sessionId=past')
    expect(
      await screen.findByText(/결제를 아직 확인하고 있어요/),
    ).toBeInTheDocument()
    expect(read).toHaveBeenCalledTimes(20)
    expect(complete).not.toHaveBeenCalled()
  })

  it.each(['missing', 'network', 'cursor-cycle'])(
    '청구 조회 %s는 승인으로 단정하지 않는다',
    async (kind) => {
      const complete = arrange([], kind === 'cursor-cycle' ? 'same' : null)
      if (kind === 'network')
        server.use(
          http.get('/api/billing/invoices', () => HttpResponse.error()),
        )
      await openApp('/billing/auth/success?sessionId=past')
      expect(
        await screen.findByText(/결제를 아직 확인하고 있어요/),
      ).toBeInTheDocument()
      expect(screen.queryByText('결제됐어요')).not.toBeInTheDocument()
      expect(complete).not.toHaveBeenCalled()
    },
  )
})
