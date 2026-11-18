import { type PropsWithChildren } from 'react'
import { useAuth } from '../../../auth/model/useAuth'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { login } from '../../../auth/api/authApi'
import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { SettingsPage } from '../../settings/pages/SettingsPage'
import { DashboardPage } from './DashboardPage'

function AuthReady({ children }: PropsWithChildren) {
  return useAuth().status === 'loading' ? null : children
}

const reason = '이 모델은 배송 5일·발주 주기 14일·배수 1 조건에서만 계산해요'
beforeEach(async () => {
  await login({ email: 'seller@a.com', password: 'pass1234' })
})

describe('모델 미지원 상품의 다음 행동', () => {
  it.each([true, false])(
    '현재 설정 제공 여부(%s)와 관계없이 사유와 설정 이동을 보여 준다',
    async (includeSettings) => {
      server.use(
        http.get('/api/dashboard/replenishment-needs', () =>
          HttpResponse.json({
            asOfDate: '2026-11-18',
            today: '2026-11-18',
            daysSinceAsOf: 0,
            resultStatus: 'UP_TO_DATE',
            runId: 142,
            resultComputedAt: '2026-11-18T03:00:00Z',
            lastFailedRunAt: null,
            latestUploadId: 1,
            summary: {
              needCount: 0,
              notNeededCount: 1,
              notCalculableCount: 2,
              excludedCount: 0,
            },
            items: [],
            notNeededItems: [
              {
                productId: 1,
                resultId: 10,
                skuBarcode: 'supported',
                skuName: '정상 상품',
                expectedShortageOn: null,
                leadTimeDays: 5,
              },
            ],
            notCalculable: [
              {
                productId: 2,
                skuName: '기간이 다른 상품',
                reason,
                ...(includeSettings
                  ? {
                      currentSettings: {
                        leadTimeDays: 6,
                        reviewCycleDays: 13,
                        orderUnitQty: 1,
                      },
                    }
                  : {}),
              },
              {
                productId: 3,
                skuName: '기록 부족 상품',
                reason: '최근 28일 중 판매한 날이 3일로 7일보다 적어요',
              },
            ],
            excluded: [],
          }),
        ),
      )
      server.use(
        http.get('/api/replenishment-settings', () =>
          HttpResponse.json({
            confirmed: true,
            leadTimeDays: 5,
            reviewCycleDays: 14,
            orderUnitQty: 1,
            reviewCycleSource: 'DEFAULT',
            calculationSupport: {
              method: 'LGBM19',
              leadTimeDays: 5,
              reviewCycleDays: 14,
            },
          }),
        ),
        http.get('/api/products', () =>
          HttpResponse.json({
            items: [
              {
                productId: 2,
                skuName: '기간이 다른 상품',
                skuBarcode: 'unsupported',
                unitCost: 10,
                isActive: true,
                settings: {
                  leadTimeDays: 6,
                  reviewCycleDays: 13,
                  orderUnitQty: 1,
                },
                overridden: ['leadTimeDays', 'reviewCycleDays'],
              },
            ],
            total: 1,
          }),
        ),
      )
      render(
        <AppProviders>
          <AuthReady>
            <MemoryRouter initialEntries={['/dashboard?tab=na']}>
              <Routes>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </MemoryRouter>
          </AuthReady>
        </AppProviders>,
      )
      const link = await screen.findByRole('link', {
        name: '기간이 다른 상품 입고 조건 확인',
      })
      expect(link).toHaveAttribute(
        'href',
        `/settings?q=${encodeURIComponent('기간이 다른 상품')}`,
      )
      const row = link.closest('tr')!
      expect(row).toHaveTextContent(reason)
      if (includeSettings)
        expect(row).toHaveTextContent(
          '현재 입고 조건: 리드타임 6일 · 입고 주기 13일',
        )
      else expect(within(row).queryByText(/현재 입고 조건:/)).toBeNull()
      expect(
        screen.queryByRole('link', { name: '기록 부족 상품 입고 조건 확인' }),
      ).toBeNull()
      expect(screen.getByText(/판매 기록이 3일 쌓였어요/)).toBeInTheDocument()
      await userEvent.setup().click(link)
      const lead = await screen.findByLabelText('기간이 다른 상품 leadTime')
      expect(lead).toBeVisible()
      expect(lead.closest('details')).toHaveAttribute('open')
      expect(lead).toHaveDisplayValue('6')
      expect(
        screen.getByLabelText('기간이 다른 상품 orderCycle'),
      ).toHaveDisplayValue('13')
    },
  )
})
