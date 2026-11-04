import { render, screen } from '@testing-library/react'
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
      <ScenarioInsight resultId={resultId} />
    </AppProviders>,
  )
}

describe('ScenarioInsight', () => {
  it('AI 문장 옆에 같은 계산값을 손그림으로 요약한다', async () => {
    renderInsight()

    expect(
      await screen.findByText(/AI가 계산 결과를 읽고 정리했어요/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(sentence(/권장량 72개.*도착 전 품절 위험은 8%/)),
    ).toBeInTheDocument()
    // 문장 속 숫자만 형광펜으로 강조한다
    expect(screen.getByText('72개', { selector: 'mark' })).toBeInTheDocument()
    // 그림은 문장이 아니라 시나리오 응답(권장 72개·80% 60개)으로 그린다
    expect(
      await screen.findByRole('img', {
        name: /품절 위험 8%에서 3%로, 60개보다 72개를 넣으면 다음 입고 때 12개 더 남아요/,
      }),
    ).toBeInTheDocument()
    // 입고량 비교 카드·직접 입력은 이 그림이 대신한다
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
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
    expect(
      await screen.findByRole('img', { name: /품절 위험/ }),
    ).toBeInTheDocument()
  })

  it('권장량이 0개면 그림 없이 문장만 둔다', async () => {
    renderInsight('zero-recommendation')

    // 문장이 다 그려질 때까지 기다린 뒤 그림이 없는지 본다
    expect((await screen.findAllByRole('listitem')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('img', { name: /품절 위험/ })).toBeNull()
  })

  it('AI 문장을 쓰는 중이라고 표시한다', () => {
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
      screen.getByText('계산 결과를 읽고 정리하는 중이에요'),
    ).toBeInTheDocument()
  })

  it('기본 문장도 못 만들면 그림 숫자를 보라고 알린다', async () => {
    renderInsight('ai-none')

    expect(
      await screen.findByText('설명 문장을 만들지 못했어요.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('숫자는 오른쪽 그림에 계산값 그대로 있어요'),
    ).toBeInTheDocument()
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
