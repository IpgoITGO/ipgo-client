import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { SettingsPage } from './SettingsPage'

const support = { method: 'LGBM19', leadTimeDays: 5, reviewCycleDays: 14 }
function setup(calculationSupport: unknown, leadTimeDays = 5) {
  server.use(
    http.get('/api/replenishment-settings', () =>
      HttpResponse.json({
        confirmed: true,
        leadTimeDays,
        reviewCycleDays: 14,
        orderUnitQty: 1,
        reviewCycleSource: 'DEFAULT',
        calculationSupport,
      }),
    ),
    http.get('/api/products', () =>
      HttpResponse.json({
        items: [
          {
            productId: 1,
            skuName: '지원 상품',
            skuBarcode: 'support',
            unitCost: 10,
            isActive: true,
            settings: { leadTimeDays: 5, reviewCycleDays: 14, orderUnitQty: 3 },
            overridden: ['orderUnitQty'],
          },
          {
            productId: 2,
            skuName: '미지원 상품',
            skuBarcode: 'unsupported',
            unitCost: 10,
            isActive: true,
            settings: { leadTimeDays: 6, reviewCycleDays: 13, orderUnitQty: 1 },
            overridden: ['leadTimeDays', 'reviewCycleDays'],
          },
        ],
        total: 2,
      }),
    ),
  )
  render(
    <AppProviders>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </AppProviders>,
  )
}

describe('모델 지원 조건 안내', () => {
  it('지원 상품의 입고 단위는 제한하지 않고 6/13 상품만 미지원으로 안내하며 실제 값을 보존한다', async () => {
    setup(support)
    expect(
      await screen.findByRole('complementary', { name: '예측 모델 지원 조건' }),
    ).toHaveTextContent('리드타임 5일 · 입고 주기 14일')
    expect(
      screen.getByText(/현재 사용 중인 상품 1개의 입고 조건/),
    ).toHaveTextContent('상품 1개')
    const supported = screen.getByLabelText('지원 상품 leadTime').closest('tr')!
    expect(supported).not.toHaveTextContent('모델 미지원')
    const input = screen.getByLabelText('미지원 상품 leadTime')
    expect(input).toHaveDisplayValue('6')
    expect(screen.getByLabelText('미지원 상품 orderCycle')).toHaveDisplayValue(
      '13',
    )
    const row = input.closest('tr')!
    expect(within(row).getByText(/모델 미지원/)).toHaveTextContent(
      '리드타임 6일 · 입고 주기 13일',
    )
    const user = userEvent.setup()
    await user.clear(input)
    await user.type(input, '5')
    const cycle = screen.getByLabelText('미지원 상품 orderCycle')
    await user.clear(cycle)
    await user.type(cycle, '14')
    expect(within(row).queryByText(/모델 미지원/)).toBeNull()
    expect(
      screen.queryByText(/현재 사용 중인 상품 .*개의 입고 조건/),
    ).toBeNull()
  })

  it.each([null, undefined])(
    'A/B 또는 구버전 응답(%s)에는 모델 제한을 적용하지 않는다',
    async (metadata) => {
      setup(metadata, 6)
      await screen.findByLabelText('미지원 상품 leadTime')
      expect(
        screen.queryByRole('complementary', { name: '예측 모델 지원 조건' }),
      ).toBeNull()
      expect(screen.queryByText(/모델 미지원/)).toBeNull()
      expect(screen.getByLabelText('기본 리드타임')).toHaveDisplayValue('6')
    },
  )

  it('저장할 수 없는 기본값을 사전에 알리고 기존 실제 값은 바꾸지 않는다', async () => {
    setup(support, 6)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '기본값이 모델 지원 조건과 달라 저장할 수 없어요',
    )
    expect(screen.getByLabelText('기본 리드타임')).toHaveDisplayValue('6')
  })
  it('미지원 기본값이면 상품별 PUT도 시작하지 않는다', async () => {
    let writes = 0
    server.use(
      http.put('/api/replenishment-settings', () => {
        writes++
        return HttpResponse.json({ saved: true, runId: null })
      }),
      http.put('/api/products/:id/replenishment-settings', () => {
        writes++
        return HttpResponse.json({ saved: true, runId: null })
      }),
    )
    setup(support, 6)
    const user = userEvent.setup()
    const input = await screen.findByLabelText('미지원 상품 leadTime')
    await user.clear(input)
    await user.type(input, '7')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    expect(
      await screen.findByText(
        '기본값이 모델 지원 조건과 달라 저장하지 않았어요. 실제 입고 조건을 확인해 주세요.',
      ),
    ).toBeInTheDocument()
    expect(writes).toBe(0)
    expect(input).toHaveDisplayValue('7')
  })
})
