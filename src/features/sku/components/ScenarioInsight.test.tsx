import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { ScenarioInsight } from './ScenarioInsight'

// AI 문장은 숫자가 따로 강조되어 여러 조각으로 나뉘므로, 문장 한 줄(li) 전체 글자로 찾는다.
function sentence(pattern: RegExp) {
  return (_: string, element: Element | null) =>
    element?.tagName === 'LI' && pattern.test(element.textContent ?? '')
}

function renderInsight(resultId: number | string = 101) {
  return render(
    <AppProviders>
      <ScenarioInsight inboundUnit={12} resultId={resultId} />
    </AppProviders>,
  )
}

describe('ScenarioInsight', () => {
  it('80%, 100%, 120% 비교와 AI 숫자를 함께 보여준다', async () => {
    renderInsight()

    expect(await screen.findByText('권장량의 80%')).toBeInTheDocument()
    expect(screen.getByText('권장량 100%')).toBeInTheDocument()
    expect(screen.getByText('권장량의 120%')).toBeInTheDocument()
    // 도착 전 위험은 결과에 하나라 위에 한 번만, 120%의 도착 후 위험만 표본 부족
    expect(
      screen.getByText(/도착하기 전 품절 위험은 8%로 모든 경우가 같아요/),
    ).toBeInTheDocument()
    expect(screen.getAllByText('표본 부족으로 미산출')).toHaveLength(1)
    expect(screen.getByText('권장')).toBeInTheDocument()
    expect(screen.getByText('예상 소진일 2026. 11. 18')).toBeInTheDocument()
    expect(
      await screen.findByText(/AI가 계산 결과를 읽고 정리했어요/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(sentence(/권장량 72개.*도착 전 품절 위험은 8%/)),
    ).toBeInTheDocument()
    // 문장 속 숫자만 형광펜으로 강조한다
    expect(screen.getByText('72개', { selector: 'mark' })).toBeInTheDocument()
  })

  it('카드를 누르면 그 카드가 골라진다', async () => {
    const user = userEvent.setup()
    renderInsight()

    // 처음엔 권장량이 골라져 있다
    const recommended = await screen.findByRole('radio', {
      name: /권장량 100%/,
    })
    expect(recommended).toHaveAttribute('aria-checked', 'true')

    const eighty = screen.getByRole('radio', { name: /권장량의 80%/ })
    await user.click(eighty)
    expect(eighty).toHaveAttribute('aria-checked', 'true')
    expect(recommended).toHaveAttribute('aria-checked', 'false')
  })

  it('AI 문장 옆에 같은 계산값을 손그림으로 요약한다', async () => {
    renderInsight()

    expect(
      await screen.findByRole('img', {
        name: /품절 위험 8%에서 3%로, 60개보다 72개를 넣으면 다음 입고 때 12개 더 남아요/,
      }),
    ).toBeInTheDocument()
  })

  it('입고 전 몫은 위에 한 번, 카드와 손그림에는 입고 뒤 못 채우는 주문만 보여 준다', async () => {
    // 휘님 시험 자료 B조건(리드타임 7일): 32/40/48개, 기말 재고 0/0/8, 총 미충족 13/5/5
    server.use(
      http.get('/api/results/:resultId/scenarios', () =>
        HttpResponse.json({
          resultId: 101,
          isEstimate: true,
          preArrivalRisk: null,
          riskSampleSize: null,
          riskStatus: 'INSUFFICIENT_SAMPLE',
          preArrivalUnmetQty: 5,
          scenarios: [
            {
              scenarioId: 1,
              type: 'P80',
              qty: 32,
              isDuplicate: false,
              expectedDepletionOn: '2026-11-09',
              expectedEndingStock: 0,
              unmetDemandQty: 13,
              postArrivalUnmetQty: 8,
              postArrivalRisk: null,
            },
            {
              scenarioId: 2,
              type: 'P100',
              qty: 40,
              isDuplicate: false,
              expectedDepletionOn: '2026-11-09',
              expectedEndingStock: 0,
              unmetDemandQty: 5,
              postArrivalUnmetQty: 0,
              postArrivalRisk: null,
            },
            {
              scenarioId: 3,
              type: 'P120',
              qty: 48,
              isDuplicate: false,
              expectedDepletionOn: '2026-11-09',
              expectedEndingStock: 8,
              unmetDemandQty: 5,
              postArrivalUnmetQty: 0,
              postArrivalRisk: null,
            },
          ],
        }),
      ),
    )
    render(
      <AppProviders>
        <ScenarioInsight inboundUnit={12} resultId={101} />
      </AppProviders>,
    )

    expect(
      await screen.findByText(/입고 전에 이미 5개는 못 팔아요/),
    ).toBeInTheDocument()
    // 합계 13/5/5에서 입고 전 5개를 빼 8/0/0
    expect(
      await screen.findByRole('img', {
        // 손그림 둘째 줄은 항상 남는 재고(못 채우는 주문은 카드가 맡음)
        name: /32개보다 40개를 넣으면 다음 입고 때 0개 더 남아요/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('8개', { selector: 'dd[data-tone="danger"]' }),
    ).toBeInTheDocument()
    // 모자라는 건 80%(32개) 하나지만 줄을 맞추려고 카드 3장 모두에 같은 줄(나머지는 0개)
    expect(
      screen.getAllByText('입고 뒤 못 채우는 주문', { selector: 'dt' }),
    ).toHaveLength(3)
  })

  it('키보드(엔터)로도 카드를 고를 수 있다', async () => {
    const user = userEvent.setup()
    renderInsight()

    const eighty = await screen.findByRole('radio', { name: /권장량의 80%/ })
    eighty.focus()
    await user.keyboard('{Enter}')

    expect(eighty).toHaveAttribute('aria-checked', 'true')
  })

  it('직접 입력을 검증하고 중복 요청 없이 비교를 추가한다', async () => {
    const user = userEvent.setup()
    let requestCount = 0
    server.use(
      http.post('/api/results/:resultId/scenarios', async ({ request }) => {
        requestCount += 1
        const body = (await request.json()) as { qty: number }
        await delay(80)
        return HttpResponse.json(
          {
            scenarioId: 4,
            type: 'CUSTOM',
            qty: body.qty,
            isDuplicate: false,
            expectedDepletionOn: '2026-12-10',
            expectedEndingStock: 44,
            unmetDemandQty: 0,
            postArrivalRisk: 0.02,
          },
          { status: 201 },
        )
      }),
    )
    renderInsight()
    await screen.findByText('권장량 100%')

    // 빈 칸의 "+" 카드를 눌러야 입력칸이 열린다
    await user.click(screen.getByRole('button', { name: '수량 넣어 비교' }))
    const input = screen.getByLabelText('직접 입력')
    await user.type(input, '0')
    await user.click(screen.getByRole('button', { name: '비교에 추가' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '1개 이상의 정수를 입력해 주세요.',
    )

    await user.clear(input)
    await user.type(input, '90')
    await user.dblClick(screen.getByRole('button', { name: '비교에 추가' }))

    expect(await screen.findByText('90개')).toBeInTheDocument()
    expect(requestCount).toBe(1)
    // 추가하면 입력칸이 닫히고 "+" 카드가 다음 칸으로 간다
    expect(screen.queryByLabelText('직접 입력')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '수량 넣어 비교' }),
    ).toBeInTheDocument()

    // 권장 3 + 직접 2 = 5칸이 차면 "+"는 줄 아래 버튼으로 내려간다
    await user.click(screen.getByRole('button', { name: '수량 넣어 비교' }))
    await user.type(screen.getByLabelText('직접 입력'), '100')
    await user.click(screen.getByRole('button', { name: '비교에 추가' }))
    expect(await screen.findByText('100개')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '+ 수량 넣어 비교' }),
    ).toBeInTheDocument()
  })

  it('AI 실패 응답은 기본 문장으로 구분하고 이유를 알린다', async () => {
    renderInsight('ai-fallback')

    expect(
      await screen.findByText(
        'AI 대신 미리 정해 둔 기본 문장이에요 · AI 응답이 늦었어요',
      ),
    ).toBeInTheDocument()
    // 기본 문장은 숫자 형광펜이 없다
    expect(screen.queryByText('72개', { selector: 'mark' })).toBeNull()
    expect(
      screen.getByText(sentence(/권장 입고량 72개를 기준/)),
    ).toBeInTheDocument()
    expect(await screen.findByText('권장량 100%')).toBeInTheDocument()
  })

  it('권장량이 0개면 직접 입력만 안내한다', async () => {
    renderInsight('zero-recommendation')

    expect(await screen.findByText(/권장량이 0개라/)).toBeInTheDocument()
    expect(screen.queryByText('권장량 100%')).not.toBeInTheDocument()
    expect(screen.getByLabelText('직접 입력')).toBeInTheDocument()
  })

  it('시나리오와 AI 생성 진행 상태를 표시한다', () => {
    server.use(
      http.get('/api/results/:resultId/scenarios', async () => {
        await delay(100)
        return HttpResponse.json({
          resultId: 101,
          isEstimate: true,
          preArrivalRisk: null,
          riskSampleSize: null,
          riskStatus: 'INSUFFICIENT_SAMPLE',
          scenarios: [],
        })
      }),
      http.get('/api/results/:resultId/insight', async () => {
        await delay(100)
        return HttpResponse.json({
          mode: 'LLM',
          sentences: ['완료'],
          state: 'NORMAL',
          stateReason: null,
          failReason: null,
          stale: false,
        })
      }),
    )
    renderInsight()

    expect(
      screen.getByRole('heading', { name: '시나리오 계산 중' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('계산 결과를 읽고 정리하는 중이에요'),
    ).toBeInTheDocument()
  })

  it('기본 문장도 못 만들면 표를 직접 비교하라고 알린다', async () => {
    renderInsight('ai-none')

    expect(
      await screen.findByText('설명 문장을 만들지 못했어요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('숫자는 위 표에 그대로 있어요')).toBeInTheDocument()
  })

  it('내용 상태 꼬리표와 이유를 보여 준다', async () => {
    renderInsight('reference-product')

    expect(await screen.findByText('확인 필요')).toBeInTheDocument()
    expect(screen.getByText('시작 재고가 추정값이에요')).toBeInTheDocument()
  })

  it('조건을 바꾼 뒤 다시 계산 전이면 갱신 전이라고 알린다', async () => {
    renderInsight('ai-stale')

    expect(
      await screen.findByText(/입고 조건이 바뀌었어요/),
    ).toBeInTheDocument()
    expect(screen.getByText('지난 계산 기준 문장이에요')).toBeInTheDocument()
  })

  it('불러오지 못하면 다시 불러오기를 준다', async () => {
    server.use(
      http.get('/api/results/:resultId/insight', () =>
        HttpResponse.json({ code: 'ERROR', message: '실패' }, { status: 500 }),
      ),
    )
    renderInsight()

    expect(
      await screen.findByText('설명 문장을 불러오지 못했어요'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '다시 불러오기' }),
    ).toBeInTheDocument()
  })
})
