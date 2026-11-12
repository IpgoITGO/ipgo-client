import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../../mocks/server'
import { openApp } from '../../../test/openApp'
import {
  applyMockDemo,
  demoSubscription,
} from '../../billing/mocks/billingHandlers'
import type { Invoice } from '../../billing/model/billingApi'

function setup(unpaid = false, method: string | null = '가상계좌') {
  applyMockDemo('seller')
  let invoice: Invoice = {
    invoiceId: 'virtual-fixture',
    planId: 'seller',
    amount: 500,
    currency: 'KRW',
    periodStart: '2026-11-12T00:00:00Z',
    periodEnd: '2026-12-12T00:00:00Z',
    status: unpaid ? 'OPEN' : 'PAID',
    paymentStatus: unpaid ? 'WAITING_FOR_DEPOSIT' : 'SUCCEEDED',
    paidAt: unpaid ? null : '2026-11-12T00:00:00Z',
    refundStatus: null,
    paymentMethod: method,
  }
  server.use(
    http.get('/api/billing/plans', () =>
      HttpResponse.json([
        {
          planId: 'seller',
          priceVersion: 'fixture',
          amount: 500,
          currency: 'KRW',
          interval: 'ONE_TIME',
          products: 300,
          monthlyInsights: 100,
          testMode: true,
          trialDays: 14,
          consentVersion: 'fixture',
        },
      ]),
    ),
    http.get('/api/billing/subscription', () =>
      HttpResponse.json({
        ...demoSubscription(unpaid ? 'trial' : 'seller'),
        ...(invoice.status === 'VOID' && !unpaid
          ? { status: 'CANCELED', cancelAtPeriodEnd: true, nextChargeAt: null }
          : {}),
      }),
    ),
    http.get('/api/billing/payment-methods', () => HttpResponse.json([])),
    http.get('/api/billing/payments', () => HttpResponse.json([])),
    http.get('/api/billing/invoices', () =>
      HttpResponse.json({ items: [invoice], nextCursor: null }),
    ),
  )
  return {
    change: (next: Partial<Invoice>) => {
      invoice = { ...invoice, ...next }
    },
  }
}
async function fillAccount(
  user: Awaited<ReturnType<typeof openApp>>['user'],
  number = '1234567890',
) {
  await user.selectOptions(screen.getByLabelText('환불 은행'), '88')
  await user.type(screen.getByLabelText('환불 계좌번호'), number)
  await user.type(screen.getByLabelText('예금주명'), '합성 예금주')
}

describe('가상계좌 발급 취소와 환불', () => {
  it('입금 전에는 환불 계좌 없이 발급을 취소한다', async () => {
    const state = setup(true)
    const cancel = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ reason: '테스트 결제 취소' })
      state.change({ status: 'VOID', refundStatus: 'CANCELED' })
      return HttpResponse.json({ status: 'CANCELED' })
    })
    server.use(http.post('/api/billing/invoices/:id/cancel-payment', cancel))
    const { user } = await openApp('/account')
    await user.click(
      await screen.findByRole('button', { name: '가상계좌 발급 취소' }),
    )
    expect(screen.getByRole('dialog')).toHaveTextContent(
      '입금 전이므로 환불할 금액은 없어요',
    )
    expect(screen.queryByLabelText('환불 계좌번호')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '발급 취소 요청' }))
    expect(await screen.findByText('셀러 · 발급 취소 완료')).toBeInTheDocument()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('입금 후에는 계좌를 검증해 전송하고 닫을 때 입력을 지운다', async () => {
    const state = setup()
    const cancel = vi.fn(async ({ request }: { request: Request }) => {
      expect(request.headers.get('Idempotency-Key')).toBeTruthy()
      expect(await request.json()).toEqual({
        reason: '테스트 결제 취소',
        refundReceiveAccount: {
          bank: '88',
          accountNumber: '1234567890',
          holderName: '합성 예금주',
        },
      })
      state.change({ status: 'VOID', refundStatus: 'CANCELED' })
      return HttpResponse.json({ status: 'CANCELED' })
    })
    server.use(http.post('/api/billing/invoices/:id/cancel-payment', cancel))
    const { user } = await openApp('/account')
    await user.click(
      await screen.findByRole('button', { name: '결제 취소·환불' }),
    )
    expect(
      screen.getByRole('button', { name: '전액 취소 요청' }),
    ).toBeDisabled()
    await fillAccount(user, '123-456-7890')
    await user.click(screen.getByRole('button', { name: '돌아가기' }))
    await user.click(screen.getByRole('button', { name: '결제 취소·환불' }))
    expect(screen.getByLabelText('환불 계좌번호')).toHaveValue('')
    expect(screen.getByLabelText('예금주명')).toHaveValue('')
    await fillAccount(user)
    await user.click(screen.getByRole('button', { name: '전액 취소 요청' }))
    expect(await screen.findByText('셀러 · 취소·환불 완료')).toBeInTheDocument()
    expect(JSON.stringify(localStorage)).not.toContain('1234567890')
    expect(screen.queryByLabelText('환불 계좌번호')).not.toBeInTheDocument()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('은행 환불 처리 중은 완료로 바꾸거나 다시 취소하지 않는다', async () => {
    const state = setup()
    const cancel = vi.fn(() => {
      state.change({ status: 'VOID', refundStatus: 'PROCESSING' })
      return HttpResponse.json({ status: 'PROCESSING' }, { status: 202 })
    })
    server.use(http.post('/api/billing/invoices/:id/cancel-payment', cancel))
    const { user } = await openApp('/account')
    await user.click(
      await screen.findByRole('button', { name: '결제 취소·환불' }),
    )
    await fillAccount(user)
    await user.click(screen.getByRole('button', { name: '전액 취소 요청' }))
    expect(await screen.findByText('셀러 · 환불 처리 중')).toBeInTheDocument()
    expect(
      screen.queryByText('결제 취소·환불이 확인됐어요'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '결제 취소·환불' }),
    ).not.toBeInTheDocument()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])(
    '계좌 입력 필요 응답(입금 경쟁=%s)은 입력창을 유지해 수정한다',
    async (racingDeposit) => {
      const state = setup(racingDeposit, null)
      const cancel = vi.fn(async ({ request }: { request: Request }) => {
        const body = await request.json()
        if (cancel.mock.calls.length === 1) {
          expect(body).toEqual({ reason: '테스트 결제 취소' })
          state.change({
            refundStatus: 'ACCOUNT_REQUIRED',
            status: 'PAID',
            paymentStatus: 'SUCCEEDED',
            paidAt: '2026-11-12T00:00:00Z',
          })
          return HttpResponse.json(
            { status: 'ACCOUNT_REQUIRED' },
            { status: 202 },
          )
        }
        expect(body.refundReceiveAccount.accountNumber).toBe('1234567890')
        state.change({ status: 'VOID', refundStatus: 'CANCELED' })
        return HttpResponse.json({ status: 'CANCELED' })
      })
      server.use(http.post('/api/billing/invoices/:id/cancel-payment', cancel))
      const { user } = await openApp('/account')
      await user.click(
        await screen.findByRole('button', {
          name: racingDeposit ? '가상계좌 발급 취소' : '결제 취소·환불',
        }),
      )
      await user.click(
        screen.getByRole('button', {
          name: racingDeposit ? '발급 취소 요청' : '전액 취소 요청',
        }),
      )
      expect(
        await screen.findByText('환불 계좌 정보를 확인해 다시 입력해 주세요.'),
      ).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: '전액 취소 요청' }),
      ).toBeDisabled()
      await fillAccount(user)
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: '전액 취소 요청',
        }),
      )
      expect(
        await screen.findByText('셀러 · 취소·환불 완료'),
      ).toBeInTheDocument()
      expect(cancel).toHaveBeenCalledTimes(2)
    },
  )
})
