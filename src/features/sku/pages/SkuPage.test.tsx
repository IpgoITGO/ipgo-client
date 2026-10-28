import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { SkuPage } from './SkuPage'

function renderSku(path: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<SkuPage />} path="/sku/:skuId" />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
}

describe('SkuPage', () => {
  it('권장 입고량과 계산 근거, 정확도를 보여준다', async () => {
    renderSku('/sku/8800272420016')

    expect(
      await screen.findByRole('heading', { name: '케어트릿 120g' }),
    ).toBeInTheDocument()
    // 시나리오 카드에도 72개가 나와서 하나 이상인지만 본다.
    expect(screen.getAllByText('72개').length).toBeGreaterThan(0)
    expect(screen.getByText('품절 1일')).toBeInTheDocument()
    expect(screen.getByText('계산식 B 선택')).toBeInTheDocument()
    expect(screen.getByText('반올림 전 필요량')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: '최근 재고와 출고 추이 그래프' }),
    ).toBeInTheDocument()
    expect(screen.getByText('지난 예측 생존 비율')).toBeInTheDocument()
  })

  it('신상품은 계산 불가 이유를 보여준다', async () => {
    renderSku('/sku/new-product')

    expect(
      await screen.findByRole('heading', { name: '신상품 트릿 30g' }),
    ).toBeInTheDocument()
    expect(screen.getByText('판매한 날이 7일보다 적어요.')).toBeInTheDocument()
  })

  it('짧은 기록과 낮은 정확도를 상태별로 안내한다', async () => {
    renderSku('/sku/reference-product')

    expect(await screen.findByText('참고용')).toBeInTheDocument()
    expect(screen.getByText(/권장량은 참고용/)).toBeInTheDocument()
    expect(screen.getByText('추정')).toBeInTheDocument()
    expect(screen.getByText('낮음')).toBeInTheDocument()
  })
})
