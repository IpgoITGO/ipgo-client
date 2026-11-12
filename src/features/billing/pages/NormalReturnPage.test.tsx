import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { NormalReturnPage } from './NormalReturnPage'
import { confirmPayment, getPayment } from '../model/normalPayment'
vi.mock('../model/normalPayment', () => ({
  confirmPayment: vi.fn(),
  getPayment: vi.fn(),
}))
const result = {
  orderId: 'order',
  invoiceId: 'invoice',
  status: 'PAID' as const,
  refundStatus: null,
  canceledAt: null,
}
function open() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <NormalReturnPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  history.replaceState(
    {},
    '',
    '/payment/success?orderId=order&paymentKey=fixture-key&amount=500',
  )
})
it('복귀 URL만으로 성공 표시하지 않고 서버 승인 결과를 기다린다', async () => {
  vi.mocked(confirmPayment).mockResolvedValue(result)
  open()
  expect(
    await screen.findByRole('heading', { name: '결제가 완료됐어요' }),
  ).toBeInTheDocument()
  expect(confirmPayment).toHaveBeenCalledWith('order', 'fixture-key', 500)
  expect(location.search).toBe('')
})
it('입금 대기는 완료와 구분한다', async () => {
  vi.mocked(confirmPayment).mockResolvedValue({ ...result, status: 'PENDING' })
  open()
  expect(await screen.findByText(/입금을 기다리고 있어요/)).toBeInTheDocument()
  expect(screen.queryByText('결제가 완료됐어요')).not.toBeInTheDocument()
})
it('승인 응답 유실 시 새 승인 없이 같은 주문을 조회한다', async () => {
  vi.mocked(confirmPayment).mockRejectedValue(new Error('timeout'))
  vi.mocked(getPayment).mockResolvedValue(result)
  open()
  expect(
    await screen.findByRole('heading', { name: '결제가 완료됐어요' }),
  ).toBeInTheDocument()
  expect(confirmPayment).toHaveBeenCalledTimes(1)
  expect(getPayment).toHaveBeenCalledWith('order')
})
it('금액이 유효하지 않으면 승인 요청을 보내지 않는다', async () => {
  history.replaceState(
    {},
    '',
    '/payment/success?orderId=order&paymentKey=fixture-key&amount=NaN',
  )
  open()
  expect(screen.getByRole('alert')).toHaveTextContent('결제 확인 정보가 없어요')
  expect(confirmPayment).not.toHaveBeenCalled()
})

it('StrictMode에서 복귀 확인 요청은 한 번만 보내고 완료 결과를 표시한다', async () => {
  vi.mocked(confirmPayment).mockResolvedValue(result)
  render(
    <StrictMode>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <NormalReturnPage />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  )
  expect(
    await screen.findByRole('heading', { name: '결제가 완료됐어요' }),
  ).toBeInTheDocument()
  expect(confirmPayment).toHaveBeenCalledTimes(1)
})
