import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestPayment } from '../model/payment'
import { CheckoutPage } from './CheckoutPage'
import { PlansPage } from './PlansPage'

vi.mock('../model/payment', async (original) => ({
  ...(await original<typeof import('../model/payment')>()),
  requestPayment: vi.fn(),
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<PlansPage />} path="/plans" />
        <Route element={<CheckoutPage />} path="/checkout" />
      </Routes>
    </MemoryRouter>,
  )
}

describe('결제', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(requestPayment).mockReset()
  })

  it('요금제 화면: 셀러 이름 옆 추천, 체험 남은 날, 세 카드가 같은 네 줄, 체험·유료 차이는 14일 뒤 줄', () => {
    renderAt('/plans')
    expect(
      screen.getByRole('heading', { name: /^셀러\s*추천\s*요금제$/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '체험 중 · 14일 남음' }),
    ).toBeDisabled()
    const cards = within(screen.getByRole('list', { name: '요금제' }))
      .getAllByRole('listitem')
      .filter((li) => li.parentElement?.getAttribute('aria-label') === '요금제')
    const rows = cards.map((card) =>
      [...card.querySelectorAll('dt')].map((dt) => dt.textContent),
    )
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map((r) => r.join('|'))).size).toBe(1)
    expect(rows[0]).toEqual(['관리 상품', '계산', 'AI 인사이트', '14일 뒤'])
    expect(cards[0]).toHaveTextContent('보기만 (계산 멈춤)')
    expect(cards[1]).toHaveTextContent('계속 계산')
  })

  it('결제 버튼 위에 오늘 낼 돈과 다음부터를 나눠 보여 준다', () => {
    renderAt('/checkout?plan=seller')
    expect(screen.getByText('오늘 결제')).toBeInTheDocument()
    expect(screen.getByText(/^매달 \d+일 49,000원$/)).toBeInTheDocument()
  })

  it('동의해야 결제 버튼이 눌리고, 성공하면 달라진 것을 보여 준다', async () => {
    vi.mocked(requestPayment).mockResolvedValue({ status: 'paid' })
    const user = userEvent.setup()
    renderAt('/checkout?plan=seller')
    const pay = screen.getByRole('button', { name: '49,000원 결제하기' })
    expect(pay).toBeDisabled()
    await user.click(screen.getByLabelText(/자동으로 결제되는 것에 동의해요/))
    await user.click(screen.getByLabelText(/카카오페이/))
    await user.click(pay)
    expect(
      await screen.findByText('셀러 요금제를 시작했어요'),
    ).toBeInTheDocument()
    expect(requestPayment).toHaveBeenCalledTimes(1)
    expect(requestPayment).toHaveBeenCalledWith('seller', 'kakaopay')
    expect(screen.getByText(/카카오페이/)).toBeInTheDocument()
  })

  it('실패하면 돈이 안 나갔다는 말부터, 결제 단계에 머문다', async () => {
    vi.mocked(requestPayment).mockResolvedValue({
      status: 'failed',
      reason: 'LIMIT_EXCEEDED',
    })
    const user = userEvent.setup()
    renderAt('/checkout?plan=business')
    await user.click(screen.getByLabelText(/자동으로 결제되는 것에 동의해요/))
    await user.click(screen.getByRole('button', { name: '129,000원 결제하기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '돈은 빠져나가지 않았어요. 카드 한도가 부족해요.',
    )
    expect(
      screen.getByRole('button', { name: '다른 수단으로 129,000원 다시 결제' }),
    ).toBeEnabled()
  })

  it('결제창을 닫으면 빨간 경고 없이 안내 한 줄', async () => {
    vi.mocked(requestPayment).mockResolvedValue({ status: 'cancelled' })
    const user = userEvent.setup()
    renderAt('/checkout?plan=seller')
    await user.click(screen.getByLabelText(/자동으로 결제되는 것에 동의해요/))
    await user.click(screen.getByRole('button', { name: '49,000원 결제하기' }))
    expect(
      await screen.findByText('결제를 멈췄어요. 고른 요금제는 그대로 있어요.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('주소의 요금제가 틀리면 요금제 화면으로', () => {
    renderAt('/checkout?plan=trial')
    expect(screen.getByRole('heading', { name: '요금제' })).toBeInTheDocument()
  })
})
