import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NormalCheckoutPage } from './NormalCheckoutPage'
import { createPayment } from '../model/normalPayment'

vi.mock('../../../shared/config/env', () => ({
  env: { tossClientKey: 'test_gck_fixture_only' },
}))
vi.mock('../model/cardWindow', () => ({
  loadToss: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../model/normalPayment', () => ({ createPayment: vi.fn() }))
const plan = {
  planId: 'seller' as const,
  priceVersion: 'v',
  amount: 500,
  currency: 'KRW',
  interval: 'ONE_TIME' as const,
  products: 300,
  monthlyInsights: 100,
  testMode: true,
  trialDays: 0,
  consentVersion: 'one-time-month-2026-11-v1',
}
const order = {
  orderId: 'server-order',
  customerKey: 'server-customer',
  amount: 500,
  orderName: '이용권',
  successUrl: 'https://example.test/payment/success',
  failUrl: 'https://example.test/payment/fail',
  expiresAt: '2030-01-01T00:00:00Z',
}
const destroy = vi.fn()
const setAmount = vi.fn().mockResolvedValue(undefined)
const renderMethods = vi.fn().mockResolvedValue({ destroy })
const renderAgreement = vi.fn().mockResolvedValue({ destroy })
const requestPayment = vi.fn().mockResolvedValue(undefined)
const widgets = vi.fn(() => ({
  setAmount,
  renderPaymentMethods: renderMethods,
  renderAgreement,
  requestPayment,
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createPayment).mockResolvedValue(order)
  requestPayment.mockResolvedValue(undefined)
  Object.assign(window, { TossPayments: vi.fn(() => ({ widgets })) })
})
async function open() {
  const user = userEvent.setup()
  const view = render(
    <MemoryRouter>
      <NormalCheckoutPage plan={plan} />
    </MemoryRouter>,
  )
  const start = screen.getByRole('button', { name: '결제 수단 불러오기' })
  expect(start).toBeDisabled()
  await user.click(screen.getByRole('checkbox'))
  await user.click(start)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: '500원 결제하기' }),
    ).toBeEnabled(),
  )
  return { user, view }
}
describe('일반결제', () => {
  it('서버 주문의 금액·고객·복귀 주소로 SDK를 초기화하고 동의 후 결제를 요청한다', async () => {
    const { user } = await open()
    expect(createPayment).toHaveBeenCalledWith(plan)
    expect(widgets).toHaveBeenCalledWith({ customerKey: order.customerKey })
    expect(setAmount).toHaveBeenCalledWith({ currency: 'KRW', value: 500 })
    expect(requestPayment).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '500원 결제하기' }))
    expect(requestPayment).toHaveBeenCalledWith({
      orderId: order.orderId,
      orderName: order.orderName,
      successUrl: order.successUrl,
      failUrl: order.failUrl,
    })
    expect(screen.queryByText('결제가 완료됐어요')).not.toBeInTheDocument()
  })
  it('창 취소 후 같은 서버 주문으로 재시도하며 새 주문을 만들지 않는다', async () => {
    requestPayment.mockRejectedValueOnce({ code: 'USER_CANCEL' })
    const { user } = await open()
    await user.click(screen.getByRole('button', { name: '500원 결제하기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '결제를 중단했어요',
    )
    await user.click(screen.getByRole('button', { name: '500원 결제하기' }))
    expect(createPayment).toHaveBeenCalledTimes(1)
    expect(requestPayment).toHaveBeenCalledTimes(2)
  })
  it('컴포넌트가 닫히면 SDK 화면을 제거한다', async () => {
    const { view } = await open()
    view.unmount()
    expect(destroy).toHaveBeenCalledTimes(2)
  })
})
