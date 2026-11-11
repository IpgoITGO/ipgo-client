import { act, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '../../../mocks/server'
import { openApp } from '../../../test/openApp'
import { openCardWindow } from '../model/cardWindow'

vi.mock('../model/cardWindow', () => ({ openCardWindow: vi.fn() }))

const plan = (amount: number) => [
  {
    planId: 'seller',
    priceVersion: 'seller-v2',
    amount,
    currency: 'KRW',
    interval: 'MONTH',
    products: 300,
    monthlyInsights: 100,
    testMode: true,
    trialDays: 14,
    consentVersion: 'monthly-2026-11-v1',
  },
]

describe('결제', () => {
  beforeEach(() => vi.mocked(openCardWindow).mockReset())

  it('요금제 화면: 셀러 이름 옆 추천, 체험 남은 날, 세 카드가 같은 네 줄, 체험·유료 차이는 14일 뒤 줄', async () => {
    await openApp('/plans')
    expect(
      await screen.findByRole('heading', { name: /^셀러\s*추천\s*요금제$/ }),
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

  it('결제 버튼 위에 서버 금액으로 오늘 낼 돈과 다음부터를 나눠 보여 준다', async () => {
    await openApp('/checkout?plan=seller')
    expect(await screen.findByText('오늘 결제')).toBeInTheDocument()
    expect(await screen.findByText(/^매달 \d+일 49,000원$/)).toBeInTheDocument()
  })

  it('서버 금액이 500원이면 500원으로 보인다', async () => {
    server.use(
      http.get('/api/billing/plans', () => HttpResponse.json(plan(500))),
    )
    await openApp('/checkout?plan=seller')
    expect(
      await screen.findByRole('button', { name: '500원 결제하기' }),
    ).toBeInTheDocument()
  })

  it('동의 → 카드 등록창 → 돌아오면 결제를 확인해 결제됐어요', async () => {
    const sent: { url: string; key: string | null }[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST') {
        sent.push({
          url: new URL(request.url).pathname,
          key: request.headers.get('Idempotency-Key'),
        })
      }
    })
    const { user, router } = await openApp('/checkout?plan=seller')
    const pay = await screen.findByRole('button', { name: '49,000원 결제하기' })
    expect(pay).toBeDisabled()
    await user.click(screen.getByLabelText(/자동으로 결제되는 것에 동의해요/))
    await user.click(pay)
    await vi.waitFor(() => expect(openCardWindow).toHaveBeenCalledTimes(1))
    const session = vi.mocked(openCardWindow).mock.calls[0][0]
    expect(
      sent.find((s) => s.url === '/api/billing/registration-sessions')?.key,
    ).toMatch(/^[A-Za-z0-9_-]{8,100}$/)

    // 결제사가 돌려보낸 주소(성공)
    const back = new URL(session.successUrl)
    await act(() =>
      router.navigate(
        `${back.pathname}${back.search}&authKey=mock_auth&customerKey=${session.customerKey}`,
      ),
    )
    expect(
      await screen.findByText('카드 등록과 결제 결과를 확인하고 있어요'),
    ).toBeInTheDocument()
    expect(await screen.findByText('결제됐어요')).toBeInTheDocument()
    expect(sent.filter((s) => s.url.endsWith('/complete'))).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '내 계정으로' }))
    expect(
      await screen.findByRole('heading', { name: '내 계정' }),
    ).toBeInTheDocument()
  })

  it('결제가 꺼져 있으면(503) 차분한 안내를 보여 준다', async () => {
    server.use(
      http.post('/api/billing/registration-sessions', () =>
        HttpResponse.json(
          { code: 'BILLING_DISABLED', message: 'off' },
          { status: 503 },
        ),
      ),
    )
    const { user } = await openApp('/checkout?plan=seller')
    await user.click(
      await screen.findByLabelText(/자동으로 결제되는 것에 동의해요/),
    )
    await user.click(
      await screen.findByRole('button', { name: '49,000원 결제하기' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '결제가 아직 켜지지 않았어요',
    )
    expect(openCardWindow).not.toHaveBeenCalled()
  })

  it('카드는 등록됐지만 결제가 거절되면 사유와 다시 시도를 보여 준다', async () => {
    server.use(
      http.post('/api/billing/registration-sessions/:id/complete', () =>
        HttpResponse.json(
          { sessionId: 's', status: 'COMPLETED' },
          { status: 202 },
        ),
      ),
      http.get('/api/billing/registration-sessions/:id', () =>
        HttpResponse.json({
          sessionId: 's',
          status: 'COMPLETED',
          invoiceId: 1,
          paymentStatus: 'DECLINED',
          errorCode: 'LIMIT_EXCEEDED',
        }),
      ),
    )
    const { router } = await openApp('/plans')
    await act(() =>
      router.navigate(
        '/billing/auth/success?sessionId=s&state=x&authKey=a&customerKey=c',
      ),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '카드 한도가 부족해요',
    )
    expect(screen.queryByText('결제됐어요')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '내 계정에서 다시 결제' }),
    ).toBeInTheDocument()
  })

  it('카드창 실패 화면: 결제사 말을 그대로, 다시 시도', async () => {
    const { router } = await openApp('/plans')
    await act(() =>
      router.navigate(
        '/billing/auth/fail?sessionId=s&state=x&code=INVALID_CARD&message=카드 정보를 확인해 주세요',
      ),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '카드 정보를 확인해 주세요',
    )
    expect(
      screen.getByRole('button', { name: '다시 시도' }),
    ).toBeInTheDocument()
  })

  it('주소의 요금제가 틀리면 요금제 화면으로', async () => {
    await openApp('/checkout?plan=trial')
    expect(
      await screen.findByRole('heading', { name: '요금제' }),
    ).toBeInTheDocument()
  })
})
