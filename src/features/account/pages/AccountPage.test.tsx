import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../../mocks/server'
import { openApp } from '../../../test/openApp'
import { applyMockDemo } from '../../billing/mocks/billingHandlers'
import { dayOf, monthDayKo } from '../../billing/model/billing'

const DAY = 86_400_000
const inDays = (n: number) =>
  monthDayKo(dayOf(new Date(Date.now() + n * DAY).toISOString()))

function recordPosts() {
  const sent: { url: string; key: string | null; body: string }[] = []
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'POST') {
      sent.push({
        url: new URL(request.url).pathname,
        key: request.headers.get('Idempotency-Key'),
        body: await request.clone().text(),
      })
    }
  })
  return sent
}

describe('내 계정', () => {
  it('이름 메뉴로 들어가고, Esc로 닫힌다', async () => {
    const { user } = await openApp('/dashboard')
    const trigger = await screen.findByRole('button', { name: /계정 메뉴/ })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(trigger).toHaveFocus())

    await user.click(trigger)
    await user.click(screen.getByRole('link', { name: '내 계정' }))
    expect(
      await screen.findByRole('heading', { name: '내 계정' }),
    ).toBeInTheDocument()
    // 화면이 바뀌면 메뉴는 닫힌다
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(await screen.findByText(/일 남음 · /)).toBeInTheDocument()
    expect(screen.getByText('seller@a.com')).toBeInTheDocument()
  })

  it('결제가 꺼져 있어도(503) 계정 화면은 쓸 수 있다', async () => {
    server.use(
      http.get('/api/billing/subscription', () =>
        HttpResponse.json(
          { code: 'BILLING_DISABLED', message: 'off' },
          { status: 503 },
        ),
      ),
    )
    await openApp('/account')
    expect(
      await screen.findByRole('heading', { name: '내 계정' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('결제가 아직 켜지지 않았어요'),
    ).toBeInTheDocument()
    expect(screen.getByText('seller@a.com')).toBeInTheDocument()
  })

  it('유료면 카드·결제 내역을 서버 값으로, 해지는 두 번 묻고 서버에 보낸다', async () => {
    applyMockDemo('seller')
    const sent = recordPosts()
    const { user } = await openApp('/account')
    expect(
      await screen.findByText(`다음 결제 ${inDays(25)} · 49,000원`),
    ).toBeInTheDocument()
    expect(screen.getByText(/433012\*{6}1234/)).toBeInTheDocument()
    expect(screen.getByText(/셀러 · 결제됨/)).toBeInTheDocument()

    // 팝업 1단계: 놓치는 것, 초점은 "그대로 쓸게요"
    await user.click(screen.getByRole('button', { name: '구독 해지' }))
    expect(await screen.findByText(/이걸 놓쳐요/)).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '그대로 쓸게요' }),
      ).toHaveFocus(),
    )
    // "그대로 쓸게요"는 해지하지 않고 닫는다
    await user.click(screen.getByRole('button', { name: '그대로 쓸게요' }))
    expect(screen.queryByText(/이걸 놓쳐요/)).not.toBeInTheDocument()
    expect(sent.some((s) => s.url.endsWith('/subscription/cancel'))).toBe(false)
    // 다시 열어 2단계에서 이유를 고르고 해지
    await user.click(screen.getByRole('button', { name: '구독 해지' }))
    await user.click(
      await screen.findByRole('button', { name: '그래도 해지할래요' }),
    )
    await user.click(screen.getByText('생각보다 잘 안 써요'))
    await user.click(screen.getByText('가격이 부담돼요'))
    const storedBefore = localStorage.getItem('ipgo:cancel-reasons')
    await user.click(screen.getByRole('button', { name: '해지하기' }))
    expect(localStorage.getItem('ipgo:cancel-reasons')).toBe(storedBefore)
    expect(
      await screen.findByText(`${inDays(25)}에 끝나요`),
    ).toBeInTheDocument()
    const cancel = sent.filter(
      (s) => s.url === '/api/billing/subscription/cancel',
    )
    expect(cancel).toHaveLength(1)
    expect(JSON.parse(cancel[0].body)).toEqual({
      reasons: ['NOT_USING', 'PRICE'],
    })
    expect(cancel[0].key).toMatch(/^[A-Za-z0-9_-]{8,100}$/)
    // 해지가 됐다고 바로 알린다
    expect(
      screen.getByText(`해지됐어요. ${inDays(25)}까지는 지금처럼 쓸 수 있어요`),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '해지 취소' }))
    expect(
      await screen.findByText('해지를 취소했어요. 지금처럼 계속 써요'),
    ).toBeInTheDocument()
    const resume = sent.find(
      (s) => s.url === '/api/billing/subscription/resume',
    )
    expect(JSON.parse(resume!.body)).toEqual({
      consentVersion: 'monthly-2026-11-v1',
    })
    expect(
      await screen.findByText(`다음 결제 ${inDays(25)} · 49,000원`),
    ).toBeInTheDocument()
  })

  it('안 된 결제는 다시 결제 한 번으로 서버에 다시 요청한다', async () => {
    applyMockDemo('pay-failed')
    const sent = recordPosts()
    const { user } = await openApp('/account')
    expect(await screen.findByText(/셀러 · 결제 안 됨/)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '다시 결제' }))
    expect(
      await screen.findByText(/다시 결제를 요청했어요/),
    ).toBeInTheDocument()
    expect(sent.some((s) => s.url === '/api/billing/invoices/2/retry')).toBe(
      true,
    )
  })
})
