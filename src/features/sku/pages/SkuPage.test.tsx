import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'

import { AppProviders } from '../../../app/providers/AppProviders'
import { SkuPage } from './SkuPage'
import { server } from '../../../mocks/server'
import detailFixture from '../model/fixtures/accuracy-history-k1.json'
import model19Detail from '../model/fixtures/model19-k1.json'
import model19Scenarios from '../model/fixtures/model19-k2.json'

function renderSku(path: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<SkuPage />} path="/sku/:skuId" />
          <Route element={<h1>입고 조건 화면</h1>} path="/settings" />
          <Route element={<h1>대시보드 화면</h1>} path="/dashboard" />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
}

describe('SkuPage', () => {
  it('모델의 소진일 없음과 입고를 포함한 재고 변동을 자료 부족·예상 출고로 단정하지 않는다', async () => {
    server.use(
      http.get('/api/products/:productId/detail', () =>
        HttpResponse.json({
          ...model19Detail,
          expectedShortageOn: null,
          result: {
            ...model19Detail.result,
            startStockEstimated: true,
            startStockQty: 20,
          },
        }),
      ),
    )
    renderSku('/sku/27')
    expect(await screen.findByText('미제공')).toBeInTheDocument()
    expect(screen.queryByText(/^\d+일 예상 출고/)).not.toBeInTheDocument()
    expect(screen.queryAllByText('자료 부족')).toHaveLength(0)
    expect(
      screen.queryByText('비교할 지난 예측이 쌓이면 보여요.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('비교할 지난 예측이 아직 없어요.'),
    ).not.toBeInTheDocument()
  })
  it('LGBM19 계산 불가는 정상 권장 0개로 표시하지 않는다', async () => {
    server.use(
      http.get('/api/products/:productId/detail', () =>
        HttpResponse.json({
          ...model19Detail,
          needStatus: 'NOT_CALCULABLE',
          result: {
            ...model19Detail.result,
            status: 'NOT_CALCULABLE',
            reason: '배송 5일과 입고 주기 14일 조건이 필요해요.',
            recommendedQty: null,
            forecastOutboundQty: null,
          },
          accuracy: null,
        }),
      ),
    )
    renderSku('/sku/27')
    expect(
      await screen.findByText('배송 5일과 입고 주기 14일 조건이 필요해요.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('권장 입고량 0개')).not.toBeInTheDocument()
  })
  it('LGBM19의 고정19일 설명과 시나리오를 표시하고 A/B 평가·미산출 원인을 꾸미지 않는다', async () => {
    server.use(
      http.get('/api/products/:productId/detail', () =>
        HttpResponse.json(model19Detail),
      ),
      http.get('/api/results/:resultId/scenarios', () =>
        HttpResponse.json(model19Scenarios),
      ),
      http.get('/api/results/:resultId/insight', () =>
        HttpResponse.json({
          mode: 'TABLE_ONLY',
          isFallback: true,
          text: null,
          failReason: 'INPUT_UNAVAILABLE',
          state: 'NORMAL',
          stateReason: null,
          stale: false,
        }),
      ),
    )
    renderSku('/sku/27')
    expect(
      await screen.findByText('앞으로 19일 동안 팔릴 양을 예측해 계산했어요'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/19일은 배송 5일에 입고 주기 14일을 더한 기간이에요/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('권장 입고량 72개')).toBeInTheDocument()
    expect(
      screen.queryByText(/최근 28일 평균|여유 배수|기본 계산 방식을 적용/),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByText('이 모델의 품절 위험은 아직 산출하지 않아요.'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('이 계산 방식은 아직 AI 설명이 없어요'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        /표본 0일|표본 부족으로 미산출|설명 문장을 만들지 못했어요/,
      ),
    ).not.toBeInTheDocument()
    expect(screen.getByText('실제 정확도 미평가')).toBeInTheDocument()
    expect(screen.getByText('권장량의 80%')).toBeInTheDocument()
    expect(screen.getByText('권장량 100%')).toBeInTheDocument()
    expect(screen.getByText('권장량의 120%')).toBeInTheDocument()
    expect(
      screen.queryByText(/다음 입고까지 버텨요|재고가 많이 남아요/),
    ).not.toBeInTheDocument()
    expect(screen.queryAllByText('자료 부족')).toHaveLength(0)
  })
  it('작년 같은 날 출고를 점선·값으로 표시하고 기록 없는 날은 선을 끊는다', async () => {
    server.use(
      http.get('/api/products/:productId/detail', () =>
        HttpResponse.json({
          ...detailFixture,
          trend: [5000, null, 0, 20].map((lastYearOutboundQty, i) => ({
            date: `2026-10-0${i + 1}`,
            closingQty: 10,
            outboundQty: 3,
            isValidObservation: true,
            lastYearOutboundQty,
          })),
        }),
      ),
    )
    renderSku('/sku/27')
    const chart = await screen.findByRole('img', { name: '재고·출고 그래프' })
    expect(screen.getByText('작년 같은 날 출고')).toBeVisible()
    expect(screen.getByText('10/3 · 작년 같은 날 출고 0개')).toBeInTheDocument()
    const series = chart.querySelector('[data-series="last-year-outbound"]')
    expect(series?.querySelectorAll('circle')).toHaveLength(3)
    expect(
      series?.querySelector('path')?.getAttribute('d')?.match(/M/g),
    ).toHaveLength(2)
    expect(series?.querySelector('path')).toHaveAttribute(
      'stroke-dasharray',
      '4 3',
    )
    expect(screen.getByText('5,000')).toBeInTheDocument()
  })

  it('주별 출고: 7일이 안 된 마지막 주는 며칠치인지 쓰고 평균은 범례에 숫자로', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/products/:productId/detail', () =>
        HttpResponse.json({
          ...detailFixture,
          // 11/1~11/10: 다 찬 한 주(하루 1개씩 7개) + 3일치
          trend: Array.from({ length: 10 }, (_, i) => ({
            date: `2026-11-${String(i + 1).padStart(2, '0')}`,
            closingQty: 10,
            outboundQty: 1,
            isValidObservation: true,
          })),
        }),
      ),
    )
    renderSku('/sku/27')
    await screen.findByRole('img', { name: '재고·출고 그래프' })
    await user.click(screen.getByRole('tab', { name: '주별 출고' }))
    expect(await screen.findByText('3일치')).toBeInTheDocument()
    expect(screen.getByText('평균 7개')).toBeInTheDocument()
    expect(screen.queryByText('덜 찬 주')).toBeNull()
  })

  it('작년 필드가 없는 기존 응답은 비교 출고를 만들어 표시하지 않는다', async () => {
    renderSku('/sku/1')
    await screen.findByRole('img', { name: '재고·출고 그래프' })
    expect(screen.queryByText('작년 같은 날 출고')).not.toBeInTheDocument()
  })

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
    expect(screen.getByText('재고 없던 날 2일')).toBeInTheDocument()
    // 추이 그래프 뒤에 "앞으로 12일" 예상 구간이 붙는다
    // 결론 문장이 그래프 위에 먼저 나오고, 범례·눈금·합계가 그림과 같은 말로 붙는다
    expect(screen.getByText(/기록 기준 재고가 바닥났어요/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '앞으로 재고' })).toBeInTheDocument()
    // 앞으로 출고는 제목 아래 숫자 칩으로
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'SPAN' &&
          el.textContent === '앞으로 12일 약 58개 나가요',
      ),
    ).toBeInTheDocument()
    // 쓴 방식 하나만 말로 보여 주고(A·B 글자 없음), 계산은 풀이 순서로 보여 준다
    expect(
      screen.getByText('작년 같은 시기와 최근 흐름으로 계산했어요'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('평가에서 이 방식이 가장 정확했어요'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/계산식 A|기준 B/)).not.toBeInTheDocument()
    expect(screen.getByText('앞으로 12일 예상 출고')).toBeInTheDocument()
    expect(screen.getByText('58개')).toBeInTheDocument()
    expect(screen.getByText(/입고 단위 \d+개로 올림/)).toBeInTheDocument()
    expect(screen.getByText('상품별')).toBeInTheDocument()
    // 정확도: 권장량으로 버틴 비율과 예측이 빗나간 정도
    expect(screen.getByText('정확도 높음')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByText('±12%')).toBeInTheDocument()
  })

  it('마지막 기록 재고와 서버 계산 시작 재고가 다르면 기록 기준임을 밝히고 서버 값을 알린다', async () => {
    renderSku('/sku/stale-stock')

    expect(await screen.findByText(/기록 기준 재고 4개/)).toBeInTheDocument()
    expect(screen.queryByText(/지금 재고/)).not.toBeInTheDocument()
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'SPAN' &&
          /^오늘 남았을 재고 9개/.test(el.textContent ?? ''),
      ),
    ).toBeInTheDocument()
  })

  it('소진일이 이미 지났으면 "→ 소진" 대신 이미 바닥났다고 쓴다', async () => {
    // 고정 자료: 시작 재고 5개(기록 8개와 다름) · 소진일 2026-11-07(지난 날)
    server.use(
      http.get('/api/products/:productId/detail', () =>
        HttpResponse.json(detailFixture),
      ),
    )
    renderSku('/sku/27')
    const chip = await screen.findByText(
      (_, el) =>
        el?.tagName === 'SPAN' &&
        /^오늘 남았을 재고 5개/.test(el.textContent ?? ''),
    )
    expect(chip).toHaveTextContent('11/7에 이미 바닥났을 거예요')
    expect(chip).not.toHaveTextContent('소진')
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
    expect(
      screen.getByText('판매한 날이 5일이에요 · 7일이 되면 계산돼요'),
    ).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '5')
    expect(
      screen.getByText(/최근 28일 기준 · 2일 더 팔리면 다음 계산에 들어가요/),
    ).toBeInTheDocument()
  })

  it('짧은 기록과 낮은 정확도를 참고용으로 안내한다', async () => {
    renderSku('/sku/reference-product')

    expect(
      await screen.findByText(/바닥났을 수 있어요 · 참고용 계산이에요/),
    ).toBeInTheDocument()
    expect(screen.getByText(/넉넉히 잡은 값이라/)).toBeInTheDocument()
    // 오른쪽 위 칩은 빠지고 안내 하나만 남는다
    expect(screen.queryByText('참고용')).toBeNull()
    expect(screen.queryByText(/재고가 바닥났을 수 있어요/)).toBeNull()
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
    // 셀러가 넣을 값: 리드타임·입고 단위 → 미입력
    expect(screen.getAllByText('미입력').length).toBeGreaterThanOrEqual(2)
    // 자료가 모자란 값: 소진일·시작 재고 → 자료 부족. 정확도는 칸마다 되풀이하지 않고 안내 하나로(11/17)
    expect(screen.getAllByText('자료 부족').length).toBeGreaterThanOrEqual(2)
    expect(
      screen.getByText('맞춰 볼 지난 예측이 아직 없어요'),
    ).toBeInTheDocument()
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
      await screen.findByText('판매 기록이 쌓이면 여기에 그래프가 보여요'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '수불부 올리기' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('img', { name: '최근 재고와 출고 추이 그래프' }),
    ).toBeNull()
  })
  it('없는 상품(404)은 찾을 수 없다고 알리고 대시보드로 보낸다', async () => {
    renderSku('/sku/missing-product')

    expect(
      await screen.findByText('이 상품을 찾을 수 없어요'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '대시보드로' }))
    expect(
      await screen.findByRole('heading', { name: '대시보드 화면' }),
    ).toBeInTheDocument()
  })
})

describe('재고 세 칸 · 이미 바닥났을 수 있어요 (#234)', () => {
  afterEach(() => vi.useRealTimers())
  const today = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${iso}T12:00:00`))
  }

  // 권장 입고량 아래 한 줄(#253): "M/D 기록 N개 − K일 예상 출고 N개 = 오늘 N개 추정"
  const flowLine = () =>
    screen.findByText(
      (_, el) =>
        el?.tagName === 'P' &&
        /^\d+\/\d+ 기록 \d+개/.test(el.textContent ?? ''),
    )

  it('기록과 오늘 사이에 간격이 있으면 예상 출고를 빼고 오늘 추정 재고까지 한 줄로 보여 준다', async () => {
    today('2026-10-20')
    renderSku('/sku/already-out')

    expect(await flowLine()).toHaveTextContent(
      /^10\/14 기록 4개.*6일 예상 출고 4개.*오늘 0개 추정$/,
    )
  })

  it('기록이 오늘 것이면 예상 출고·오늘 추정 없이 기록만 보여 준다', async () => {
    today('2026-10-14')
    renderSku('/sku/already-out')

    const line = await flowLine()
    expect(line).toHaveTextContent(/^10\/14 기록 4개/)
    expect(line).not.toHaveTextContent(/예상 출고/)
  })

  it('소진일이 지났으면 엔진 날짜 그대로 두고 옆에 "N일 지남"을 붙인다(ai #76)', async () => {
    renderSku('/sku/already-out')

    await flowLine()
    expect(screen.getByText('3일 지남')).toBeInTheDocument()
    expect(screen.queryByText('이미 바닥')).not.toBeInTheDocument()
  })
})

it('미확정 방식은 B 설명·계산식·성과·내부 정보를 노출하지 않는다 (#391)', async () => {
  server.use(
    http.get('/api/products/:productId/detail', () =>
      HttpResponse.json({
        ...detailFixture,
        result: {
          ...detailFixture.result,
          method: 'UNAGREED_METHOD_FIXTURE',
          methodReason: '/private/model-path product-code=secret 대체',
          horizonDays: 19,
        },
      }),
    ),
  )
  renderSku('/sku/27')
  expect(
    await screen.findByText('이 계산 방식의 설명은 아직 제공되지 않았어요'),
  ).toBeInTheDocument()
  expect(
    screen.queryByText(/최근 28일 평균|기본 계산 방식을 적용|여유 배수/),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText(
      /UNAGREED_METHOD_FIXTURE|private\/model-path|product-code/,
    ),
  ).not.toBeInTheDocument()
  expect(screen.getByText('실제 정확도 미평가')).toBeInTheDocument()
  expect(screen.queryByText('정확도 높음')).not.toBeInTheDocument()
  expect(screen.queryByText(/예측 범위/)).not.toBeInTheDocument()
  expect(
    screen.queryByRole('img', { name: /버틴 비율|빗나간/ }),
  ).not.toBeInTheDocument()
})
