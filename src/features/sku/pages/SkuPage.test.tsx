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
    expect(screen.getByLabelText('권장 입고량 72개')).toBeInTheDocument()
    // 대시보드에서 소진일이 지난 상품이라 상세에도 품절 주의와 할 일 한 줄
    expect(screen.getByRole('img', { name: /품절 주의/ })).toBeInTheDocument()
    expect(
      screen.getByText(
        /재고가 바닥났을 수 있어요 · 권장 72개를 지금 넣어 주세요/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('품절 2일')).toBeInTheDocument()
    // 추이 그래프 뒤에 "앞으로 12일" 예상 구간이 붙는다
    // 결론 문장이 그래프 위에 먼저 나오고, 범례·눈금·합계가 그림과 같은 말로 붙는다
    expect(screen.getByText(/기록 기준 재고가 없어요/)).toBeInTheDocument()
    expect(screen.getByText('예상 하루 출고(노란 막대)')).toBeInTheDocument()
    expect(screen.getByText('+12일')).toBeInTheDocument()
    expect(screen.getByText('합계 약 58개')).toBeInTheDocument()
    // 쓴 방식 하나만 말로 보여 주고(A·B 글자 없음), 계산은 풀이 순서로 보여 준다
    expect(
      screen.getByText('작년 같은 시기와 최근 흐름으로 계산했어요'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('평가에서 이 방식이 가장 정확했어요'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/계산식 A|기준 B/)).not.toBeInTheDocument()
    expect(screen.getByText('앞으로 12일 예상 출고')).toBeInTheDocument()
    expect(screen.getByText('58개')).toBeInTheDocument()
    expect(screen.getByText(/입고 단위 \d+개로 올림/)).toBeInTheDocument()
    expect(screen.getByText('상품별')).toBeInTheDocument()
    // 정확도는 기획서 말: 커버 성공률과 예측 오차
    expect(screen.getByText('정확도 높음')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: '10번 중 9번 성공' }),
    ).toBeInTheDocument()
    expect(screen.getByText('12%')).toBeInTheDocument()
  })

  it('마지막 기록 재고와 서버 계산 시작 재고가 다르면 기록 기준임을 밝히고 서버 값을 알린다', async () => {
    renderSku('/sku/stale-stock')

    expect(await screen.findByText(/기록 기준 재고 4개/)).toBeInTheDocument()
    expect(screen.queryByText(/지금 재고/)).not.toBeInTheDocument()
    expect(
      screen.getByText(/서버 계산은 시작 재고 9개 기준/),
    ).toBeInTheDocument()
  })

  it('기본 방식을 못 쓰는 상품은 다른 방식으로 대체했다고 알린다', async () => {
    renderSku('/sku/fallback-product')

    expect(
      await screen.findByText('작년 자료가 없어 최근 28일 평균으로 계산했어요'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/B로 대체/)).not.toBeInTheDocument()
    // 입고 전에 이미 놓친 주문은 계산 근거에 한 줄로 빼서 보여 준다(70 − 25 − 5 = 40처럼 풀이가 맞게)
    expect(screen.getByText('도착 전에 못 파는 양')).toBeInTheDocument()
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

  it('서버가 값을 비워 보내면 —·0원 대신 미입력·자료 부족으로 알리고 고치는 곳을 잇는다', async () => {
    renderSku('/sku/empty-values')

    expect(
      await screen.findByRole('heading', { name: '케어트릿 120g' }),
    ).toBeInTheDocument()
    // 출고지가 없으면 그 줄을 빼고, 비어 보이는 "—일"·"0원"은 없다
    expect(screen.queryByText('서울 풀필먼트')).toBeNull()
    expect(screen.queryByText(/—일/)).toBeNull()
    expect(screen.queryByText('0원')).toBeNull()
    // 사장님이 넣을 값: 리드타임·입고 단위 → 미입력
    expect(screen.getAllByText('미입력').length).toBeGreaterThanOrEqual(2)
    // 자료가 모자란 값: 소진일·시작 재고·정확도 → 자료 부족
    expect(screen.getAllByText('자료 부족').length).toBeGreaterThanOrEqual(3)
    expect(
      screen.getByRole('link', { name: '단가를 넣으면 보여요 →' }),
    ).toHaveAttribute('href', '/settings')
    expect(
      screen.getByRole('link', { name: '입고 조건에서 정하기 →' }),
    ).toHaveAttribute('href', '/settings')
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
