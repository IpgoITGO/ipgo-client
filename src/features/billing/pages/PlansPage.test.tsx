import { screen, waitFor } from '@testing-library/react'
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

describe('미선택 계정의 체험 시작 (#393)', () => {
  function setup() {
    let subscription = {
      planId: 'trial',
      status: 'NOT_SELECTED',
      planChosenAt: null as string | null,
      trialEnd: null as string | null,
      periodStart: null,
      periodEnd: null,
      nextChargeAt: null,
      cancelAtPeriodEnd: false,
      graceUntil: null,
      amount: 0,
      priceVersion: 'fixture',
      entitlements: {
        canCalculate: false,
        canUpload: false,
        canGenerateInsight: false,
        productLimit: 300,
        monthlyInsightLimit: 100,
        reason: 'PLAN_NOT_SELECTED' as string | null,
      },
    }
    const keys: (string | null)[] = []
    server.use(
      http.get('/api/billing/subscription', () =>
        HttpResponse.json(subscription),
      ),
      http.post('/api/billing/trial/start', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        subscription = {
          ...subscription,
          status: 'TRIALING',
          planChosenAt: new Date().toISOString(),
          trialEnd: trialEndsIn(14),
          entitlements: {
            ...subscription.entitlements,
            canCalculate: true,
            canUpload: true,
            canGenerateInsight: true,
            reason: null,
          },
        }
        return HttpResponse.json(subscription)
      }),
    )
    return keys
  }

  it('미선택은 종료로 표시하지 않고 서버 성공 후 14일 체험 상태를 보여 준다', async () => {
    const keys = setup()
    const { user } = await openApp('/plans')
    const bar = await screen.findByRole('region', { name: '지금 상태' })
    expect(bar).toHaveTextContent('요금제를 골라 주세요')
    expect(bar).not.toHaveTextContent('끝')
    expect(bar).not.toHaveTextContent('D-')
    expect(screen.queryByText('지금 쓰는 중')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '14일 체험으로 시작' }))
    await waitFor(() => expect(bar).toHaveTextContent('D-14'))
    expect(keys).toHaveLength(1)
    expect(keys[0]).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: '14일 체험으로 시작' }),
    ).not.toBeInTheDocument()
  })

  it('실패하면 오류를 표시하고 같은 키로 재시도하며 선택 전 상태를 유지한다', async () => {
    setup()
    const keys: (string | null)[] = []
    server.use(
      http.post('/api/billing/trial/start', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        return HttpResponse.json(
          { code: 'BILLING_DISABLED', message: '결제가 아직 켜지지 않았어요' },
          { status: 503 },
        )
      }),
    )
    const { user } = await openApp('/plans')
    const button = await screen.findByRole('button', {
      name: '14일 체험으로 시작',
    })
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '결제가 아직 켜지지 않았어요',
    )
    expect(screen.getByRole('region', { name: '지금 상태' })).toHaveTextContent(
      '요금제를 골라 주세요',
    )
    await user.click(button)
    await waitFor(() => expect(keys).toHaveLength(2))
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
  })
})
