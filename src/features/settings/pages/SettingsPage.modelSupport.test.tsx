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
    // 맞지 않는 상품 수는 표 위 "모델 밖" 칩으로
    expect(screen.getByRole('button', { name: /모델 밖/ })).toHaveTextContent(
      '모델 밖1',
    )
    const supported = screen.getByLabelText('지원 상품 leadTime').closest('tr')!
    expect(supported).not.toHaveTextContent('모델 밖')
    const input = screen.getByLabelText('미지원 상품 leadTime')
    expect(input).toHaveDisplayValue('6')
    expect(screen.getByLabelText('미지원 상품 orderCycle')).toHaveDisplayValue(
      '13',
    )
    const row = input.closest('tr')!
    // 행에는 숫자를 되풀이하지 않는 딱지 하나
    expect(within(row).getByText('모델 밖')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.clear(input)
    await user.type(input, '5')
    const cycle = screen.getByLabelText('미지원 상품 orderCycle')
    await user.clear(cycle)
    await user.type(cycle, '14')
    expect(within(row).queryByText('모델 밖')).toBeNull()
    expect(screen.getByRole('button', { name: /모델 밖/ })).toHaveTextContent(
      '모델 밖0',
    )
  })

  it.each([null, undefined])(
    'A/B 또는 구버전 응답(%s)에는 모델 제한을 적용하지 않는다',
    async (metadata) => {
      setup(metadata, 6)
      await screen.findByLabelText('미지원 상품 leadTime')
      expect(
        screen.queryByRole('complementary', { name: '예측 모델 지원 조건' }),
      ).toBeNull()
      expect(screen.queryByText(/모델 밖/)).toBeNull()
      expect(screen.getByLabelText('기본 리드타임')).toHaveDisplayValue('6')
    },
  )

  it('저장할 수 없는 기본값은 미리 경고하지 않고, 누를 때 토스트로 알리고 그 칸으로 보낸다', async () => {
    setup(support, 6)
    await screen.findByLabelText('미지원 상품 leadTime')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('기본 리드타임')).toHaveDisplayValue('6')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      '기본값이 새 모델 조건과 달라 저장하지 않았어요',
    )
    await user.click(screen.getByRole('button', { name: '고치러 가기' }))
    expect(screen.getByLabelText('기본 리드타임')).toHaveFocus()
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
      await screen.findByText('기본값이 새 모델 조건과 달라 저장하지 않았어요'),
    ).toBeInTheDocument()
    expect(writes).toBe(0)
    expect(input).toHaveDisplayValue('7')
  })
})
