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
function fixture(cycle: number | null, override = false) {
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
  it('실제 응답의 제안값을 표시하고 기본값 저장만 보낸다', async () => {
    const f = fixture(7)
    const user = userEvent.setup()
    renderSettings()
    expect(await screen.findByLabelText('시험상품 orderCycle')).toHaveValue(7)
    expect(screen.getByLabelText('기본 입고 주기')).toHaveValue(7)
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
  it('표본 부족에서는 빈칸을 유지하고 수동 기본값 입력을 상속해 저장한다', async () => {
    const f = fixture(null)
    const user = userEvent.setup()
    renderSettings()
    expect(await screen.findByLabelText('시험상품 orderCycle')).toHaveValue(
      null,
    )
    expect(screen.getByText(/입고 기록이 부족해요/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('기본 입고 주기'), '14')
    await waitFor(() =>
      expect(screen.getByLabelText('시험상품 orderCycle')).toHaveValue(14),
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
    expect(screen.getByLabelText('시험상품 orderCycle')).toHaveValue(19)
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
    expect(screen.getByLabelText('기본 입고 주기')).toHaveValue(10)
    expect(screen.getByLabelText('시험상품 orderCycle')).toHaveValue(12)
  })
  it('기본값을 바꾼 뒤 상품을 원래 수치로 직접 입력해도 새 override를 저장한다', async () => {
    const f = fixture(7)
    const user = userEvent.setup()
    renderSettings()
    await screen.findByLabelText('시험상품 orderCycle')
    await user.clear(screen.getByLabelText('기본 입고 주기'))
    await user.type(screen.getByLabelText('기본 입고 주기'), '10')
    await waitFor(() =>
      expect(screen.getByLabelText('시험상품 orderCycle')).toHaveValue(10),
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
