import { act, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import type { ServerSubscription } from '../model/billingApi'

import { server } from '../../../mocks/server'
import { openApp } from '../../../test/openApp'

// 막 가입해 수불부가 없는 계정의 대시보드 응답
const emptyDashboard = {
  asOfDate: null,
  today: '2026-11-12',
  daysSinceAsOf: null,
  resultStatus: null,
  runId: null,
  resultComputedAt: null,
  lastFailedRunAt: null,
  latestUploadId: null,
  summary: {
    needCount: 0,
    notNeededCount: 0,
    notCalculableCount: 0,
    excludedCount: 0,
  },
  items: [],
  notNeededItems: [],
  notCalculable: [],
  excluded: [],
}

function noUpload() {
  let subscription: ServerSubscription = {
    planId: 'trial',
    status: 'NOT_SELECTED',
    planChosenAt: null,
    trialEnd: null,
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
      reason: 'PLAN_NOT_SELECTED',
    },
  }
  const sent: string[] = []
  const choose = () => {
    subscription = {
      ...subscription,
      status: 'TRIALING',
      planChosenAt: new Date().toISOString(),
      trialEnd: new Date(Date.now() + 14 * 86400000).toISOString(),
      entitlements: {
        ...subscription.entitlements,
        canCalculate: true,
        canUpload: true,
        canGenerateInsight: true,
        reason: null,
      },
    }
    return subscription
  }
  server.use(
    http.get('/api/dashboard/replenishment-needs', () =>
      HttpResponse.json(emptyDashboard),
    ),
    http.get('/api/billing/subscription', () =>
      HttpResponse.json(subscription),
    ),
    http.post('/api/billing/trial/start', ({ request }) => {
      sent.push(request.headers.get('Idempotency-Key') ?? '')
      return HttpResponse.json(
        subscription.planChosenAt ? subscription : choose(),
      )
    }),
  )
  return { sent, choose }
}

const gate = () =>
  screen.findByRole('dialog', { name: '어떤 요금제로 시작할까요?' })

describe('첫 대시보드 요금제 고르기(#323)', () => {
  afterEach(() => localStorage.clear())

  it('수불부가 없으면 요금제 카드 3장 창이 뜨고 바깥·Esc로는 안 닫힌다', async () => {
    noUpload()
    const { user } = await openApp('/dashboard')
    const dialog = await gate()
    expect(
      within(dialog)
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^14일 체험/),
        expect.stringMatching(/^셀러/),
        expect.stringMatching(/^비즈니스/),
      ]),
    )
    // 아직 고르기 전이라 "지금 쓰는 중"은 안 보인다
    expect(within(dialog).queryByText('지금 쓰는 중')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(document.body)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('Tab을 계속 눌러도 초점이 창 안에서만 돈다', async () => {
    noUpload()
    const { user } = await openApp('/dashboard')
    const dialog = await gate()
    for (let i = 0; i < 8; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    await user.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('체험을 고르면 시작 확인 창 → 닫으면 다시 안 뜬다', async () => {
    const fixture = noUpload()
    const { user, router } = await openApp('/dashboard')
    await user.click(
      within(await gate()).getByRole('button', { name: '14일 체험으로 시작' }),
    )
    expect(fixture.sent).toHaveLength(1)
    expect(fixture.sent[0]).toMatch(/^[A-Za-z0-9_-]{8,100}$/)
    expect(localStorage.getItem('ipgo:plan-picked:seller@a.com')).toBeNull()
    const done = await screen.findByRole('dialog', {
      name: '14일 체험을 시작했어요',
    })
    expect(done).toHaveTextContent(/\d+월 \d+일까지 셀러와 똑같이 써요/)
    await user.click(within(done).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // 다른 화면에 갔다 와도 다시 묻지 않는다
    await act(() => router.navigate('/settings'))
    await act(() => router.navigate('/dashboard'))
    await screen.findByText('아직 계산 전이에요')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('시작 확인에서 수불부 올리러 가기 → 업로드 화면', async () => {
    noUpload()
    const { user, router } = await openApp('/dashboard')
    await user.click(
      within(await gate()).getByRole('button', { name: '14일 체험으로 시작' }),
    )
    await user.click(
      await screen.findByRole('button', { name: '수불부 올리러 가기' }),
    )
    expect(router.state.location.pathname).toBe('/upload')
  })

  it('셀러를 고르면 결제 화면으로 가고, 결제 없이 돌아오면 다시 뜬다', async () => {
    noUpload()
    const { user, router } = await openApp('/dashboard')
    await user.click(
      within(await gate()).getByRole('button', { name: '셀러로 시작하기' }),
    )
    expect(router.state.location.pathname).toBe('/checkout')
    await act(() => router.navigate('/dashboard'))
    expect(await gate()).toBeInTheDocument()
  })

  it('옛 브라우저 선택 기록이 있어도 서버 미선택이면 다시 묻는다', async () => {
    noUpload()
    localStorage.setItem('ipgo:plan-picked:seller@a.com', '1')
    await openApp('/dashboard')
    expect(await gate()).toBeInTheDocument()
  })

  it('다른 기기에서 고른 서버 기록이 있으면 브라우저 기록 없이 묻지 않는다', async () => {
    const fixture = noUpload()
    fixture.choose()
    await openApp('/dashboard')
    await screen.findByText('아직 계산 전이에요')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('시작 실패는 확인 창을 열지 않고 같은 키로 재시도한다', async () => {
    const fixture = noUpload()
    const keys: string[] = []
    server.use(
      http.post('/api/billing/trial/start', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '')
        return keys.length === 1
          ? HttpResponse.json(
              { code: 'TEMPORARY', message: '잠시 뒤 다시 시도해 주세요' },
              { status: 503 },
            )
          : HttpResponse.json(fixture.choose())
      }),
    )
    const { user } = await openApp('/dashboard')
    await user.click(
      within(await gate()).getByRole('button', { name: '14일 체험으로 시작' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '잠시 뒤 다시 시도해 주세요',
    )
    expect(
      screen.queryByRole('dialog', { name: '14일 체험을 시작했어요' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '14일 체험으로 시작' }))
    expect(
      await screen.findByRole('dialog', { name: '14일 체험을 시작했어요' }),
    ).toBeInTheDocument()
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
  })

  it('필드가 없는 구버전 서버에는 체험 시작을 보내지 않는다', async () => {
    const fixture = noUpload()
    const legacy = fixture.choose()
    delete legacy.planChosenAt
    await openApp('/dashboard')
    await screen.findByText('아직 계산 전이에요')
    expect(
      screen.queryByRole('dialog', { name: '어떤 요금제로 시작할까요?' }),
    ).not.toBeInTheDocument()
    expect(fixture.sent).toHaveLength(0)
  })

  it('재가입 체험 제한 계정에는 유료 선택만 허용한다', async () => {
    const fixture = noUpload()
    const reused = fixture.choose()
    reused.planChosenAt = null
    reused.status = 'TRIAL_EXPIRED'
    reused.entitlements = {
      ...reused.entitlements,
      canCalculate: false,
      canUpload: false,
      canGenerateInsight: false,
      reason: 'TRIAL_ALREADY_USED',
    }
    await openApp('/dashboard')
    const dialog = await gate()
    expect(
      within(dialog).queryByRole('button', { name: '14일 체험으로 시작' }),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: '체험 재사용 불가' }),
    ).toBeDisabled()
    expect(
      within(dialog).getByRole('button', { name: '셀러로 시작하기' }),
    ).toBeEnabled()
  })

  it('수불부를 올린 계정에는 안 뜬다', async () => {
    await openApp('/dashboard')
    await screen.findByRole('tab', { name: /^전체/ })
    expect(
      screen.queryByRole('dialog', { name: '어떤 요금제로 시작할까요?' }),
    ).not.toBeInTheDocument()
  })
})
