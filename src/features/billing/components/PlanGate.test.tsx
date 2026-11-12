import { act, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

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
  server.use(
    http.get('/api/dashboard/replenishment-needs', () =>
      HttpResponse.json(emptyDashboard),
    ),
  )
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
    noUpload()
    const { user, router } = await openApp('/dashboard')
    await user.click(
      within(await gate()).getByRole('button', { name: '14일 체험으로 시작' }),
    )
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

  it('수불부를 올린 계정에는 안 뜬다', async () => {
    await openApp('/dashboard')
    await screen.findByRole('tab', { name: /^전체/ })
    expect(
      screen.queryByRole('dialog', { name: '어떤 요금제로 시작할까요?' }),
    ).not.toBeInTheDocument()
  })
})
