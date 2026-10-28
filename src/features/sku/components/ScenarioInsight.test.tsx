import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { ScenarioInsight } from './ScenarioInsight'

function renderInsight(skuId = '8800272420016') {
  return render(
    <AppProviders>
      <ScenarioInsight inboundUnit={12} skuId={skuId} />
    </AppProviders>,
  )
}

describe('ScenarioInsight', () => {
  it('80%, 100%, 120% 비교와 AI 숫자를 함께 보여준다', async () => {
    renderInsight()

    expect(await screen.findByText('권장량의 80%')).toBeInTheDocument()
    expect(screen.getByText('권장량 100%')).toBeInTheDocument()
    expect(screen.getByText('권장량의 120%')).toBeInTheDocument()
    expect(screen.getAllByText('표본 부족으로 미산출')).toHaveLength(2)
    expect(screen.getByText('권장')).toBeInTheDocument()
    expect(screen.getByText('예상 소진일 2026. 11. 18')).toBeInTheDocument()
    expect(await screen.findByText('AI 생성')).toBeInTheDocument()
    expect(
      screen.getByText(/권장량 72개.*도착 전 품절 위험은 8%/),
    ).toBeInTheDocument()
  })

  it('직접 입력을 검증하고 중복 요청 없이 비교를 추가한다', async () => {
    const user = userEvent.setup()
    let requestCount = 0
    server.use(
      http.post('/api/skus/:skuId/scenarios', async ({ request }) => {
        requestCount += 1
        const body = (await request.json()) as { quantity: number }
        await delay(80)
        return HttpResponse.json({
          id: 'custom',
          label: '직접 입력',
          quantity: body.quantity,
          expectedStockoutDate: '2026. 12. 10',
          remainingAtNextInbound: 44,
          preArrivalRisk: 7,
          postArrivalRisk: 2,
          estimated: true,
          sampleSize: 44,
        })
      }),
    )
    renderInsight()
    await screen.findByText('권장량 100%')

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
  })

  it('AI 실패 응답은 기본 문장으로 구분한다', async () => {
    renderInsight('ai-fallback')

    expect(await screen.findByText('기본 문장')).toBeInTheDocument()
    expect(screen.getByText(/권장 입고량 72개를 기준/)).toBeInTheDocument()
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
      http.get('/api/skus/:skuId/scenarios', async () => {
        await delay(100)
        return HttpResponse.json({ recommendedQuantity: 72, scenarios: [] })
      }),
      http.get('/api/skus/:skuId/insight', async () => {
        await delay(100)
        return HttpResponse.json({ source: 'ai', message: '완료' })
      }),
    )
    renderInsight()

    expect(
      screen.getByRole('heading', { name: '시나리오 계산 중' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '인사이트 생성 중' }),
    ).toBeInTheDocument()
  })
})
