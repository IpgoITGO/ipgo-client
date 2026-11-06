import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { type SkuDetail } from '../model/skuApi'
import { AccuracyCard } from './SkuPage'

const accuracy: NonNullable<SkuDetail['accuracy']> = {
  grade: 'high',
  coverSuccess: 1,
  coverTrials: 1,
  errorRate: 0,
  range: null,
  history: [{ date: '2026-05-01', outbound: 13, predictedOutbound: 13 }],
  evaluation: {
    status: 'AVAILABLE',
    reason: null,
    source: 'HISTORICAL_REPLAY',
    period: 'TUNE',
    periodStart: '2026-05-01',
    periodEnd: '2026-07-31',
    observedThrough: '2026-11-03',
    horizonDays: 10,
  },
}

describe('AccuracyCard 과거 재생 이력', () => {
  it('평가 출처와 H일 합계를 밝히고 연도 있는 이력을 그린다', () => {
    render(<AccuracyCard accuracy={accuracy} />)
    expect(
      screen.getByText(/과거 자료 재생 · 정책 조정 구간/),
    ).toHaveTextContent('10일 출고 합계')
    expect(
      screen.getByText(/과거 자료 재생 · 정책 조정 구간/),
    ).toHaveTextContent('당시 발행한 예측의 실측 성과는 아니에요')
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: '그래프 범례' }),
    ).toBeInTheDocument()
  })
  it('표본이 없으면 안내만 보여주고 그래프를 만들지 않는다', () => {
    render(
      <AccuracyCard
        accuracy={{
          ...accuracy,
          history: [],
          evaluation: { ...accuracy.evaluation!, status: 'EMPTY' },
        }}
      />,
    )
    expect(screen.getByText(/비교할 유효한 자료가 없어/)).toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: '그래프 범례' }),
    ).not.toBeInTheDocument()
  })
  it('평가 미실행과 구버전 기록 없음을 구분한다', () => {
    const view = render(
      <AccuracyCard
        accuracy={{
          ...accuracy,
          history: [],
          evaluation: { ...accuracy.evaluation!, status: 'UNAVAILABLE' },
        }}
      />,
    )
    expect(
      screen.getByText(/재생 평가를 수행하지 않았어요/),
    ).toBeInTheDocument()
    view.rerender(
      <AccuracyCard
        accuracy={{ ...accuracy, history: [], evaluation: null }}
      />,
    )
    expect(
      screen.getByText(/저장된 과거 재생 이력이 없어요/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: '그래프 범례' }),
    ).not.toBeInTheDocument()
  })
  it('이력이 한 건이어도 실제·예측 점을 차트 중앙에 표시한다', () => {
    render(<AccuracyCard accuracy={accuracy} />)
    const graph = screen.getByRole('img', {
      name: '과거 실제 출고량과 예측 출고량 비교 그래프',
    })
    const [actual, predicted] = graph.querySelectorAll('circle')
    expect(graph.querySelectorAll('circle')).toHaveLength(2)
    expect(actual?.tagName).toBe('circle')
    expect(predicted?.tagName).toBe('circle')
    expect(actual).toHaveAttribute('cx', '312')
    expect(predicted).toHaveAttribute('cx', '312')
  })
  it('실제 출고 합계가 0이어도 커버 평가는 유지하고 WAPE 미산출 이유를 보여준다', () => {
    render(
      <AccuracyCard
        accuracy={{
          ...accuracy,
          errorRate: null,
          history: [{ date: '2026-05-01', outbound: 0, predictedOutbound: 0 }],
        }}
      />,
    )
    expect(screen.getByText('정확도 높음')).toBeInTheDocument()
    expect(
      screen.getByText(/실제 출고가 0이라 예측 오차 비율을 계산할 수 없어요/),
    ).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})
