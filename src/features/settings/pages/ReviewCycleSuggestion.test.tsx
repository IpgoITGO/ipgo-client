import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { SettingsPage } from './SettingsPage'

function Refresh() {
  const client = useQueryClient()
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={async () => {
        await client.invalidateQueries({ queryKey: ['inbound-settings'] })
        setDone(true)
      }}
    >
      {done ? '재조회 완료' : '재조회'}
    </button>
  )
}
function renderSettings() {
  render(
    <AppProviders>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route
            path="/settings"
            element={
              <>
                <SettingsPage />
                <Refresh />
              </>
            }
          />
          <Route path="/dashboard" element={<p>저장 완료</p>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
}
const suggestion = {
  reviewCycleDays: 7,
  from: '2025-01-01',
  to: '2026-11-01',
  productCount: 120,
}
function fixture(
  cycle: number | null,
  override = false,
  recommended?: typeof suggestion | null,
) {
  let currentCycle = cycle
  let reads = 0
  const savedDefaults: unknown[] = []
  const savedProducts: unknown[] = []
  server.use(
    http.get('/api/replenishment-settings', () => {
      reads++
      return HttpResponse.json({
        confirmed: false,
        leadTimeDays: 5,
        reviewCycleDays: currentCycle,
        orderUnitQty: 1,
        reviewCycleSource: 'ESTIMATED',
        reviewCycleSuggestion: recommended,
      })
    }),
    http.get('/api/products', () =>
      HttpResponse.json({
        items: [
          {
            productId: 321,
            skuBarcode: 'A',
            skuName: '시험상품',
            unitCost: 100,
            isActive: true,
            settings: {
              leadTimeDays: 5,
              reviewCycleDays: override ? 19 : currentCycle,
              orderUnitQty: 1,
            },
            overridden: override ? ['reviewCycleDays'] : [],
          },
        ],
        total: 1,
      }),
    ),
    http.put('/api/replenishment-settings', async ({ request }) => {
      savedDefaults.push(await request.json())
      return HttpResponse.json({ saved: true, runId: null })
    }),
    http.put(
      '/api/products/321/replenishment-settings',
      async ({ request }) => {
        savedProducts.push(await request.json())
        return HttpResponse.json({ saved: true, runId: null })
      },
    ),
  )
  return {
    savedDefaults,
    savedProducts,
    change: (value: number) => {
      currentCycle = value
    },
    reads: () => reads,
  }
}

describe('입고 주기 제안과 상속', () => {
  it('전체 추천값 응답으로 세 기본값을 한 번에 복원하고 저장은 나중에 한다', async () => {
    const f = fixture(14, true, suggestion)
    server.use(
      http.get('/api/replenishment-settings', () =>
        HttpResponse.json({
          confirmed: true,
          leadTimeDays: 12,
          reviewCycleDays: 14,
          orderUnitQty: 8,
          reviewCycleSource: 'DEFAULT',
          reviewCycleSuggestion: suggestion,
          suggestion: { leadTimeDays: 5, reviewCycleDays: 7, orderUnitQty: 1 },
        }),
      ),
    )
    const user = userEvent.setup()
    renderSettings()
    const apply = await screen.findByRole('button', {
      name: '추천값으로 되돌리기',
    })
    expect(apply).toBeEnabled()
    expect(
      screen.getByText('발주부터 입고 도착까지 · 추천 5일'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/추천 7일 · 2025-01 ~ 2026-11 · 상품 120개 기준/),
    ).toBeInTheDocument()
    await user.click(apply)
    expect(screen.getByLabelText('기본 리드타임')).toHaveValue('5')
    expect(screen.getByLabelText('기본 입고 주기')).toHaveValue('7')
    expect(screen.getByLabelText('기본 입고 단위')).toHaveValue('1')
    expect(screen.getByLabelText('시험상품 orderCycle')).toHaveValue('19')
    expect(apply).toBeDisabled()
    expect(f.savedDefaults).toEqual([])
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    await waitFor(() =>
      expect(f.savedDefaults).toEqual([
        {
          leadTimeDays: 5,
          reviewCycleDays: 7,
          orderUnitQty: 1,
          recalculate: true,
        },
      ]),
    )
  })

  it('이전 서버에서는 주기만 복원하고 재조회가 편집값을 덮어쓰지 않는다', async () => {
    const f = fixture(14, true, suggestion)
    const user = userEvent.setup()
    renderSettings()
    const apply = await screen.findByRole('button', {
      name: '추천값으로 되돌리기',
    })
    expect(
      screen.getByText(/추천 7일 · 2025-01 ~ 2026-11 · 상품 120개 기준/),
    ).toBeInTheDocument()
    const input = screen.getByLabelText('기본 입고 주기')
    await user.clear(screen.getByLabelText('기본 리드타임'))
    await user.type(screen.getByLabelText('기본 리드타임'), '12')
    await user.click(apply)
    expect(input).toHaveValue('7')
    expect(input).toHaveFocus()
    expect(screen.getByLabelText('기본 리드타임')).toHaveValue('12')
    expect(screen.getByLabelText('시험상품 orderCycle')).toHaveValue('19')
    expect(apply).toBeDisabled()
    expect(f.savedDefaults).toEqual([])
    f.change(21)
    await user.click(screen.getByRole('button', { name: '재조회' }))
    await screen.findByRole('button', { name: '재조회 완료' })
    expect(input).toHaveValue('7')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    await waitFor(() =>
      expect(f.savedDefaults).toEqual([
        {
          leadTimeDays: 12,
          reviewCycleDays: 7,
          orderUnitQty: 1,
          recalculate: true,
        },
      ]),
    )
    expect(f.savedProducts).toEqual([])
  })
  it('추천값과 같으면 버튼이 비활성이고 편집 뒤 복원하면 상속 상품에도 반영한다', async () => {
    const f = fixture(7, false, suggestion)
    const user = userEvent.setup()
    renderSettings()
    const input = await screen.findByLabelText('기본 입고 주기')
    const apply = screen.getByRole('button', { name: '추천값으로 되돌리기' })
    expect(apply).toBeDisabled()
    await user.clear(input)
    await user.type(input, '14')
    expect(apply).toBeEnabled()
    await user.click(apply)
    expect(input).toHaveValue('7')
    await waitFor(() =>
      expect(screen.getByLabelText('시험상품 orderCycle')).toHaveValue('7'),
    )
    expect(f.savedDefaults).toEqual([])
  })
  it('새 응답의 주기 추천이 null이면 그 칸을 유지하며 나머지만 복원한다', async () => {
    fixture(14, false, suggestion)
    server.use(
      http.get('/api/replenishment-settings', () =>
        HttpResponse.json({
          confirmed: true,
          leadTimeDays: 12,
          reviewCycleDays: 14,
          orderUnitQty: 8,
          reviewCycleSource: 'DEFAULT',
          reviewCycleSuggestion: suggestion,
          suggestion: {
            leadTimeDays: 5,
            reviewCycleDays: null,
            orderUnitQty: 1,
          },
        }),
      ),
    )
    const user = userEvent.setup()
    renderSettings()
    await user.click(
      await screen.findByRole('button', { name: '추천값으로 되돌리기' }),
    )
    expect(screen.getByLabelText('기본 입고 주기')).toHaveValue('14')
    expect(screen.getByLabelText('기본 리드타임')).toHaveValue('5')
    expect(screen.getByLabelText('기본 입고 단위')).toHaveValue('1')
  })
  it.each([null, undefined])(
    '추천값이 %s이면 복원 버튼을 끄고 입력값을 유지한다',
    async (recommended) => {
      fixture(14, false, recommended)
      renderSettings()
      await screen.findByLabelText('기본 입고 주기')
      expect(screen.queryByText(/상품 120개 기준/)).toBeNull()
      expect(
        screen.getByRole('button', { name: '추천값으로 되돌리기' }),
      ).toBeDisabled()
    },
  )
  it('실제 응답의 제안값을 표시하고 기본값 저장만 보낸다', async () => {
    const f = fixture(7)
    const user = userEvent.setup()
    renderSettings()
    expect(await screen.findByLabelText('시험상품 orderCycle')).toHaveValue('7')
    expect(screen.getByLabelText('기본 입고 주기')).toHaveValue('7')
    expect(
      screen.getByText('수불부 입고 간격으로 추정했어요'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    await waitFor(() =>
      expect(f.savedDefaults).toEqual([
        {
          leadTimeDays: 5,
          reviewCycleDays: 7,
          orderUnitQty: 1,
          recalculate: true,
        },
      ]),
    )
    expect(f.savedProducts).toEqual([])
  })
  it('표본 부족이면 처음 값 14일을 넣어 두고, 고친 기본값을 상품이 따라 저장한다', async () => {
    const f = fixture(null)
    const user = userEvent.setup()
    renderSettings()
    expect(await screen.findByLabelText('시험상품 orderCycle')).toHaveValue(
      '14',
    )
    expect(screen.getByLabelText('기본 입고 주기')).toHaveValue('14')
    expect(screen.getByText(/처음 값 14일이에요/)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('기본 입고 주기'))
    await user.type(screen.getByLabelText('기본 입고 주기'), '10')
    await waitFor(() =>
      expect(screen.getByLabelText('시험상품 orderCycle')).toHaveValue('10'),
    )
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    await waitFor(() => expect(f.savedDefaults).toHaveLength(1))
    expect(f.savedProducts).toEqual([])
  })
  it('기본 제안을 수정해도 상품별 확정값은 보존한다', async () => {
    const f = fixture(7, true)
    const user = userEvent.setup()
    renderSettings()
    await screen.findByLabelText('시험상품 orderCycle')
    await user.clear(screen.getByLabelText('기본 입고 주기'))
    await user.type(screen.getByLabelText('기본 입고 주기'), '10')
    expect(screen.getByLabelText('시험상품 orderCycle')).toHaveValue('19')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    await waitFor(() => expect(f.savedDefaults).toHaveLength(1))
    expect(f.savedProducts).toEqual([])
  })
  it('상품별 직접 수정과 기존 override만 S3에 저장한다', async () => {
    const f = fixture(7, true)
    const user = userEvent.setup()
    renderSettings()
    await screen.findByLabelText('시험상품 orderCycle')
    await user.clear(screen.getByLabelText('시험상품 leadTime'))
    await user.type(screen.getByLabelText('시험상품 leadTime'), '3')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    await waitFor(() =>
      expect(f.savedProducts).toEqual([
        { leadTimeDays: 3, reviewCycleDays: 19 },
      ]),
    )
    expect(f.savedDefaults).toHaveLength(1)
  })
  it('재조회로 새 제안이 와도 입력 중인 기본값과 상품별 수정은 유지한다', async () => {
    const f = fixture(7)
    const user = userEvent.setup()
    renderSettings()
    await screen.findByLabelText('시험상품 orderCycle')
    await user.clear(screen.getByLabelText('기본 입고 주기'))
    await user.type(screen.getByLabelText('기본 입고 주기'), '10')
    await user.clear(screen.getByLabelText('시험상품 orderCycle'))
    await user.type(screen.getByLabelText('시험상품 orderCycle'), '12')
    f.change(9)
    await user.click(screen.getByRole('button', { name: '재조회' }))
    await waitFor(() => expect(f.reads()).toBeGreaterThan(1))
    await screen.findByRole('button', { name: '재조회 완료' })
    expect(screen.getByLabelText('기본 입고 주기')).toHaveValue('10')
    expect(screen.getByLabelText('시험상품 orderCycle')).toHaveValue('12')
  })
  it('기본값을 바꾼 뒤 상품을 원래 수치로 직접 입력해도 새 override를 저장한다', async () => {
    const f = fixture(7)
    const user = userEvent.setup()
    renderSettings()
    await screen.findByLabelText('시험상품 orderCycle')
    await user.clear(screen.getByLabelText('기본 입고 주기'))
    await user.type(screen.getByLabelText('기본 입고 주기'), '10')
    await waitFor(() =>
      expect(screen.getByLabelText('시험상품 orderCycle')).toHaveValue('10'),
    )
    await user.clear(screen.getByLabelText('시험상품 orderCycle'))
    await user.type(screen.getByLabelText('시험상품 orderCycle'), '7')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    await waitFor(() => expect(f.savedDefaults).toHaveLength(1))
    expect(f.savedProducts).toEqual([{ reviewCycleDays: 7 }])
  })
  it('상속값 편집을 원래대로 되돌린 뒤 원가만 저장하면 새 override를 만들지 않는다', async () => {
    const f = fixture(7)
    const user = userEvent.setup()
    renderSettings()
    await screen.findByLabelText('시험상품 orderCycle')
    await user.clear(screen.getByLabelText('시험상품 orderCycle'))
    await user.type(screen.getByLabelText('시험상품 orderCycle'), '12')
    await user.clear(screen.getByLabelText('시험상품 orderCycle'))
    await user.type(screen.getByLabelText('시험상품 orderCycle'), '7')
    await user.clear(screen.getByLabelText('시험상품 원가'))
    await user.type(screen.getByLabelText('시험상품 원가'), '200')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    await waitFor(() => expect(f.savedDefaults).toHaveLength(1))
    expect(f.savedProducts).toEqual([{ unitCost: 200 }])
  })
})
