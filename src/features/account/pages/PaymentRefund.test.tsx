import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../../../mocks/server'
import { openApp } from '../../../test/openApp'
import { applyMockDemo } from '../../billing/mocks/billingHandlers'

describe('본인 결제 전액 취소', () => {
  it('구독 해지와 다른 확인창에서 전액 취소하고 서버 확정 결과를 보여 준다', async () => {
    applyMockDemo('seller')
    const { user } = await openApp('/account')
    await user.click(
      await screen.findByRole('button', { name: '결제 취소·환불' }),
    )
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText(/전액을 취소합니다/)).toBeInTheDocument()
    expect(dialog.getByText(/다음 자동 청구도 중지/)).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: '전액 취소 요청' }))
    expect(await screen.findByText('셀러 · 취소·환불 완료')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '결제 취소·환불' }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByText('결제 취소·환불이 확인됐어요'),
    ).toBeInTheDocument()
    expect(screen.getByText('이용 종료')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '해지 취소' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '요금제 바꾸기' }))
    await screen.findByText('유료 이용이 끝났어요')
    expect(
      screen.getByRole('button', { name: '셀러로 시작하기' }),
    ).toBeEnabled()
  })

  it('돌아가기만 누르면 취소 API를 부르지 않는다', async () => {
    applyMockDemo('seller')
    const cancel = vi.fn(() => HttpResponse.json({ status: 'CANCELED' }))
    server.use(http.post('/api/billing/invoices/:id/cancel-payment', cancel))
    const { user } = await openApp('/account')
    await user.click(
      await screen.findByRole('button', { name: '결제 취소·환불' }),
    )
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '돌아가기',
      }),
    )
    expect(cancel).not.toHaveBeenCalled()
  })

  it('202 UNKNOWN 응답은 완료가 아닌 확인 중으로 안내한다', async () => {
    applyMockDemo('seller')
    const cancel = vi.fn(async ({ request }: { request: Request }) => {
      expect(request.headers.get('Idempotency-Key')).toMatch(
        /^[A-Za-z0-9_-]{8,100}$/,
      )
      expect(await request.json()).toEqual({ reason: '테스트 결제 취소' })
      return HttpResponse.json({ status: 'UNKNOWN' }, { status: 202 })
    })
    server.use(http.post('/api/billing/invoices/:id/cancel-payment', cancel))
    const { user } = await openApp('/account')
    await user.click(
      await screen.findByRole('button', { name: '결제 취소·환불' }),
    )
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '전액 취소 요청',
      }),
    )
    expect(
      await screen.findByText(/취소 결과를 확인하고 있어요/),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('결제 취소·환불이 확인됐어요'),
    ).not.toBeInTheDocument()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each(['PROCESSING', 'UNKNOWN', 'REVIEW_REQUIRED', 'CANCELED'])(
    '%s 환불 내역은 새 취소 요청 버튼을 제공하지 않는다',
    async (refundStatus) => {
      applyMockDemo('seller')
      server.use(
        http.get('/api/billing/invoices', () =>
          HttpResponse.json({
            items: [
              {
                invoiceId: 1,
                planId: 'seller',
                amount: 500,
                currency: 'KRW',
                periodStart: new Date().toISOString(),
                periodEnd: new Date().toISOString(),
                status: 'PAID',
                paymentStatus: 'SUCCEEDED',
                paidAt: new Date().toISOString(),
                refundStatus,
              },
            ],
            nextCursor: null,
          }),
        ),
      )
      await openApp('/account')
      await screen.findByText('500원')
      expect(
        screen.queryByRole('button', { name: '결제 취소·환불' }),
      ).not.toBeInTheDocument()
    },
  )
  it('취소 응답 유실 후 같은 멱등키로 재확인하고 결과를 확정한다', async () => {
    applyMockDemo('seller')
    const keys: (string | null)[] = []
    server.use(
      http.post('/api/billing/invoices/:id/cancel-payment', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        return keys.length === 1
          ? HttpResponse.error()
          : HttpResponse.json({ status: 'CANCELED' })
      }),
    )
    const { user } = await openApp('/account')
    await user.click(
      await screen.findByRole('button', { name: '결제 취소·환불' }),
    )
    const dialog = within(screen.getByRole('dialog'))
    await user.click(dialog.getByRole('button', { name: '전액 취소 요청' }))
    await dialog.findByRole('alert')
    expect(
      screen.queryByText('결제 취소·환불이 확인됐어요'),
    ).not.toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: '전액 취소 요청' }))
    expect(
      await screen.findByText('결제 취소·환불이 확인됐어요'),
    ).toBeInTheDocument()
    expect(keys).toHaveLength(2)
    expect(keys[0]).toEqual(keys[1])
  })
})
