import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../../mocks/server'
import { openApp } from '../../../test/openApp'
import { applyMockDemo, patchMockSubscription } from '../mocks/billingHandlers'
import { dayOf } from '../model/billing'

const DAY = 86_400_000
// 체험이 N일 남도록(끝나는 날 낮 12시)
const trialEndsIn = (days: number) => {
  const d = new Date()
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    12,
  ).toISOString()
}

async function show() {
  await openApp('/plans')
  return screen.findByRole('region', { name: '지금 상태' })
}

describe('요금제 상태 줄', () => {
  it('10일 남음: 초록 원 D-10, 14일 체험 쓰는 중, 꼬리표와 14칸 막대', async () => {
    patchMockSubscription({ trialEnd: trialEndsIn(10) })
    const bar = await show()
    expect(bar).toHaveTextContent('D-10')
    expect(bar).toHaveTextContent('14일 체험 쓰는 중')
    expect(bar).not.toHaveAttribute('data-state')
    expect(screen.getByText('지금 쓰는 중')).toBeInTheDocument()
    expect(screen.getByText('10일 남음')).toBeInTheDocument()
  })

  it('2일 남음: 노랑, 셀러로 이어 쓰기 버튼', async () => {
    patchMockSubscription({ trialEnd: trialEndsIn(2) })
    const bar = await show()
    expect(bar).toHaveTextContent('D-2')
    expect(bar).toHaveTextContent('체험이 2일 남았어요')
    expect(bar).toHaveAttribute('data-state', 'soon')
    expect(
      screen.getByRole('button', { name: '셀러로 이어 쓰기' }),
    ).toBeInTheDocument()
  })

  it('끝남: 끝, 체험이 끝났어요, 체험 끝 도장, 꼬리표 없음', async () => {
    applyMockDemo('trial-ended')
    const bar = await show()
    expect(bar).toHaveTextContent('끝')
    expect(bar).toHaveTextContent('체험이 끝났어요')
    expect(bar).toHaveTextContent('자료는 그대로 볼 수 있어요')
    expect(screen.getByText('체험 끝')).toBeInTheDocument()
    expect(screen.queryByText('지금 쓰는 중')).not.toBeInTheDocument()
  })

  it('셀러: 쓰는 중 · 다음 결제일, 셀러 카드에 꼬리표, 도장 없음', async () => {
    applyMockDemo('seller')
    const bar = await show()
    const [, m, d] = dayOf(new Date(Date.now() + 25 * DAY).toISOString())
      .split('-')
      .map(Number)
    expect(bar).toHaveTextContent(`셀러 쓰는 중 · 다음 결제 ${m}/${d}`)
    expect(bar).not.toHaveTextContent('D-')
    expect(screen.getByText('지금 쓰는 중')).toBeInTheDocument()
    expect(screen.queryByText('체험 끝')).not.toBeInTheDocument()
  })

  it('가격은 서버 요금제 값을 따른다(500원이면 500원)', async () => {
    server.use(
      http.get('/api/billing/plans', () =>
        HttpResponse.json([
          {
            planId: 'seller',
            priceVersion: 'seller-v2',
            amount: 500,
            currency: 'KRW',
            interval: 'MONTH',
            products: 300,
            monthlyInsights: 100,
            testMode: true,
            trialDays: 14,
            consentVersion: 'monthly-2026-11-v1',
          },
        ]),
      ),
    )
    await show()
    expect(await screen.findByText('500')).toBeInTheDocument()
  })
  it('확정 환불된 요금제는 쓰는 중이 아닌 다시 시작하기를 제공한다', async () => {
    applyMockDemo('seller')
    patchMockSubscription({
      status: 'CANCELED',
      cancelAtPeriodEnd: true,
      nextChargeAt: null,
    })
    await openApp('/plans')
    await screen.findByText('유료 이용이 끝났어요')
    expect(
      screen.getByRole('button', { name: '셀러로 시작하기' }),
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: '쓰는 중' }),
    ).not.toBeInTheDocument()
  })
})
