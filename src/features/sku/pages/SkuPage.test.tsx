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
          <Route element={<h1>입고 조건 화면</h1>} path="/settings" />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
}

describe('SkuPage', () => {
  it('서버 상세를 받아 권장 입고량, 기획서대로의 계산 근거, 정확도를 보여준다', async () => {
    renderSku('/sku/1')

    expect(
      await screen.findByRole('heading', { name: '케어트릿 120g' }),
    ).toBeInTheDocument()
    expect(screen.getByText('72개')).toBeInTheDocument()
    expect(screen.getByText('2026. 10. 22')).toBeInTheDocument()
    expect(screen.getByText('품절 1일')).toBeInTheDocument()
    // 평가로 정한 기본 방식(A)을 썼고, B는 쓰지 않았다
    expect(screen.getByText('적용 · 평가로 선정')).toBeInTheDocument()
    expect(screen.getByText('평가에서 A가 더 정확했어요')).toBeInTheDocument()
    expect(screen.getByText('평가 결과 기본 방식')).toBeInTheDocument()
    expect(screen.getByText('58개')).toBeInTheDocument()
    expect(screen.getByText('상품별')).toBeInTheDocument()
    // 정확도는 기획서 말: 커버 성공률과 예측 오차
    expect(screen.getByText('정확도 높음')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: '10번 중 9번 성공' }),
    ).toBeInTheDocument()
    expect(screen.getByText('12%')).toBeInTheDocument()
  })

  it('기본 방식을 못 쓰는 상품은 다른 방식으로 대체했다고 알린다', async () => {
    renderSku('/sku/fallback-product')

    expect(await screen.findByText('적용 · 대체')).toBeInTheDocument()
    expect(screen.getByText('쓸 수 없음')).toBeInTheDocument()
    expect(screen.getByText('작년 자료 없어 B로 대체')).toBeInTheDocument()
    expect(screen.getByText('66개')).toBeInTheDocument()
  })

  it('신상품은 계산 불가 이유를 보여준다', async () => {
    renderSku('/sku/new-product')

    expect(
      await screen.findByRole('heading', { name: '신상품 트릿 30g' }),
    ).toBeInTheDocument()
    expect(screen.getByText('판매한 날이 7일보다 적어요.')).toBeInTheDocument()
  })

  it('짧은 기록과 낮은 정확도를 참고용으로 안내한다', async () => {
    renderSku('/sku/reference-product')

    expect(await screen.findByText('참고용')).toBeInTheDocument()
    expect(screen.getByText(/권장량은 참고용/)).toBeInTheDocument()
    expect(screen.getByText('추정')).toBeInTheDocument()
    expect(screen.getByText('정확도 낮음')).toBeInTheDocument()
    expect(screen.getByText('예측 범위 40~70개 · 참고용')).toBeInTheDocument()
  })

  it('계산 전이면 안내와 입고 조건으로 가는 버튼을 보여준다', async () => {
    renderSku('/sku/no-result')

    expect(await screen.findByText('아직 계산 전이에요')).toBeInTheDocument()
    expect(screen.getByText('계산 전')).toBeInTheDocument()
    screen.getByRole('button', { name: '입고 조건 확인하기' }).click()
    expect(
      await screen.findByRole('heading', { name: '입고 조건 화면' }),
    ).toBeInTheDocument()
  })

  it('추이 기록이 아직 없으면 그래프 자리에 모으는 중이라고 알린다', async () => {
    renderSku('/sku/no-trend')

    expect(
      await screen.findByText('재고·출고 기록을 모으는 중이에요'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('img', { name: '최근 재고와 출고 추이 그래프' }),
    ).toBeNull()
  })
})
