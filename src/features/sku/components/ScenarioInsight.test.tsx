import { login } from '../../../auth/api/authApi'
import { loadPlanned, savePlanned } from '../model/plannedQuantity'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

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
      <ScenarioInsight
        baseDate="2026. 11. 4"
        inboundUnit={12}
        productId="7"
        resultId={resultId}
      />
    </AppProviders>,
  )
}

// 기준일 11/4에서 7일 안쪽인 날로 "오늘"을 고정한다(7일 넘으면 직접 수량 비교가 잠긴다). 시계(타이머)는 그대로 둔다
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 10, 6, 10))
})
afterAll(() => {
  vi.useRealTimers()
})

describe('ScenarioInsight', () => {
  it('기준일이 7일 넘게 지나면 비교 계산 버튼을 잠그고 이유를 알린다', async () => {
    vi.setSystemTime(new Date(2026, 10, 20, 10))
    const user = userEvent.setup()
    renderInsight()
    await user.click(
      await screen.findByRole('button', { name: '수량 넣어 비교' }),
    )
    expect(screen.getByRole('button', { name: '비교에 추가' })).toBeDisabled()
    expect(
      screen.getByText(/7일 넘게 지나 비교 계산은 막혀/),
    ).toBeInTheDocument()
    vi.setSystemTime(new Date(2026, 10, 6, 10))
  })

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

  it('202 생성 중이면 기다리는 화면을 유지하고 완료 문장을 다시 조회한다', async () => {
    let calls = 0
    server.use(
      http.get('/api/results/:resultId/insight', () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json({ status: 'GENERATING' }, { status: 202 })
        }
        return HttpResponse.json({
          mode: 'AI',
          isFallback: false,
          text: '새로 생성한 설명이에요.',
        })
      }),
    )
    renderInsight()
    expect(
      await screen.findByText('계산 결과를 읽고 정리하는 중이에요'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('AI 설명을 사용하지 않고 있어요.'),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByText('새로 생성한 설명이에요.', {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('계산 결과를 읽고 정리하는 중이에요'),
    ).not.toBeInTheDocument()
    expect(calls).toBe(2)
    // 완료 뒤의 주기에는 재조회하지 않는다.
    await new Promise((resolve) => setTimeout(resolve, 2100))
    expect(calls).toBe(2)
  })

  it('생성 중 재조회가 실패하면 오류를 보여 주고 수동으로 다시 불러온다', async () => {
    let calls = 0
    server.use(
      http.get('/api/results/:resultId/insight', () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json({ status: 'GENERATING' }, { status: 202 })
        }
        if (calls === 2 || calls === 3) {
          return HttpResponse.json(
            { code: 'ERROR', message: '조회 실패' },
            { status: 503 },
          )
        }
        return HttpResponse.json({
          mode: 'FIXED',
          text: '다시 읽은 기본 설명이에요.',
        })
      }),
    )
    const user = userEvent.setup()
    renderInsight()
    expect(
      await screen.findByText(
        '설명 문장을 불러오지 못했어요',
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('계산 결과를 읽고 정리하는 중이에요'),
    ).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 2100))
    expect(calls).toBe(3)
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(
      await screen.findByText('다시 읽은 기본 설명이에요.'),
    ).toBeInTheDocument()
    expect(calls).toBe(4)
  }, 10000)

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
        name: /도착 후 품절 위험 9%에서 3%로, 60개보다 72개를 넣으면 다음 입고 때 12개 더 남아요/,
      }),
    ).toBeInTheDocument()
    // 도착 전 위험(8%)은 낮아서 따로 경고하지 않는다
    expect(screen.queryByText(/입고 전에 바닥날 위험/)).not.toBeInTheDocument()
  })

  // 11/5: 도착 전 100% → 도착 후 29%를 화살표로 이어 "넣으면 줄어든다"처럼 읽히던 문제
  it('도착 전 위험이 높으면 그림과 따로 한 줄로 알린다', async () => {
    server.use(
      http.get('/api/results/:resultId/scenarios', () =>
        HttpResponse.json({
          resultId: 101,
          isEstimate: true,
          preArrivalRisk: 1,
          riskSampleSize: 44,
          riskStatus: 'OK',
          preArrivalUnmetQty: 0,
          scenarios: [
            {
              scenarioId: 1,
              type: 'P80',
              qty: 60,
              isDuplicate: false,
              expectedDepletionOn: null,
              expectedEndingStock: 14,
              unmetDemandQty: 0,
              postArrivalUnmetQty: 0,
              postArrivalRisk: 0.41,
            },
            {
              scenarioId: 2,
              type: 'P100',
              qty: 72,
              isDuplicate: false,
              expectedDepletionOn: null,
              expectedEndingStock: 26,
              unmetDemandQty: 0,
              postArrivalUnmetQty: 0,
              postArrivalRisk: 0.29,
            },
          ],
        }),
      ),
    )
    renderInsight()

    expect(
      await screen.findByText(
        '입고 전에 바닥날 위험 100% · 넣는 양과 상관없어요',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /도착 후 품절 위험 41%에서 29%로/ }),
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
        <ScenarioInsight
          baseDate="2026. 11. 4"
          inboundUnit={12}
          productId="7"
          resultId={101}
        />
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

    // 4칸 격자(11/11): 더 넣어도 "+" 카드는 늘 마지막 칸에 남고 다음 줄로 넘어간다
    await user.click(screen.getByRole('button', { name: '수량 넣어 비교' }))
    await user.type(screen.getByLabelText('직접 입력'), '100')
    await user.click(screen.getByRole('button', { name: '비교에 추가' }))
    expect(await screen.findByText('100개')).toBeInTheDocument()
    const grid = screen.getByRole('radiogroup', { name: '입고량 비교' })
    expect(grid.lastElementChild).toHaveTextContent('수량 넣어 비교')
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

describe('내 입고량 서버 저장', () => {
  beforeEach(async () => {
    await login({ email: 'seller@a.com', password: 'pass1234' })
    server.use(
      http.get('/api/dashboard/replenishment-needs', () =>
        HttpResponse.json({
          runId: 31,
          asOfDate: '2026-11-04',
          items: [{ productId: 7, resultId: 101 }],
        }),
      ),
      http.get('/api/products/7/detail', () =>
        HttpResponse.json({
          asOfDate: '2026-11-04',
          result: { resultId: 101, status: 'OK' },
        }),
      ),
    )
  })
  it('카드 선택을 서버에 저장하고 다시 마운트해도 읽으며 되돌리기는 DELETE한다', async () => {
    const user = userEvent.setup()
    const view = renderInsight()
    await screen.findByText('권장량의 80%')
    const button = screen.getAllByRole('button', {
      name: '이 수량으로 정하기',
    })[0]
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    await waitFor(async () =>
      expect((await loadPlanned())['7']).toMatchObject({
        quantity: 60,
        calculationRunId: 31,
        source: 'SCENARIO_80',
      }),
    )
    expect(await screen.findByText('✓ 이 수량으로 넣어요')).toBeInTheDocument()
    view.unmount()
    renderInsight()
    expect(await screen.findByText('✓ 이 수량으로 넣어요')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '되돌리기' })[0])
    await waitFor(async () =>
      expect((await loadPlanned())['7']).toBeUndefined(),
    )
  })
  it('실패 응답과 중복 클릭을 성공으로 표시하지 않는다', async () => {
    let writes = 0
    server.use(
      http.put('/api/products/7/planned-quantity', async () => {
        writes++
        await delay(80)
        return HttpResponse.json(
          { message: '저장하지 못했어요.' },
          { status: 500 },
        )
      }),
    )
    renderInsight()
    const user = userEvent.setup()
    await screen.findByText('권장량의 80%')
    const button = screen.getAllByRole('button', {
      name: '이 수량으로 정하기',
    })[0]
    await waitFor(() => expect(button).toBeEnabled())
    await user.dblClick(button)
    expect(await screen.findByText('저장하지 못했어요.')).toBeInTheDocument()
    expect(writes).toBe(1)
    expect(await loadPlanned()).toEqual({})
  })
  it('같은 날짜라도 지난 run의 저장 수량을 유지하고 명시적으로 재확인한다', async () => {
    await savePlanned('7', {
      quantity: 50,
      source: 'MANUAL',
      decidedAt: '',
      calculationRunId: 30,
    })
    renderInsight()
    const user = userEvent.setup()
    expect(await screen.findByText(/이전 계산 기준이에요/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '50개 그대로' }))
    await waitFor(async () =>
      expect((await loadPlanned())['7'].calculationRunId).toBe(31),
    )
  })
})
