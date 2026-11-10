import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { type SkuDetail } from '../model/skuApi'
import { AccuracyCard } from './SkuPage'

const point = (
  date: string,
  outbound: number,
  predictedOutbound: number,
  covered = true,
) => ({
  date,
  outbound,
  predictedOutbound,
  covered,
})

const accuracy: NonNullable<SkuDetail['accuracy']> = {
  grade: 'high',
  coverSuccess: 2,
  coverTrials: 3,
  errorRate: 12,
  range: null,
  history: [
    point('2026-09-01', 12, 13),
    point('2026-09-08', 19, 15, false),
    point('2026-09-15', 14, 14),
  ],
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

describe('AccuracyCard 지난 예측 맞춰 보기', () => {
  it('숫자 두 개를 각자의 그래프로 풀고, 기간은 실제 기준일로 짧게 밝힌다', () => {
    render(<AccuracyCard accuracy={accuracy} />)
    expect(
      screen.getByText(/9\/1~9\/15 · 3번 · 매번 그날부터 10일 동안/),
    ).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()
    expect(
      screen.getByText('3번 중 2번 버텼어요 · 9/8 품절'),
    ).toBeInTheDocument()
    expect(screen.getByText('±12%')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: '지난 예측과 실제 출고, 버텼는지' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: '지난 예측이 빗나간 정도' }),
    ).toBeInTheDocument()
    // 엔진 용어 문단과 작은 척도는 없다
    expect(screen.queryByText(/정책 조정 구간|과거 자료 재생/)).toBeNull()
    expect(screen.queryByText('2026-09-01')).toBeNull()
  })

  it('품절 주는 실제 막대와 날짜를 흙빨강으로, 15% 넘게 빗나간 주에는 비율을 적는다', () => {
    render(<AccuracyCard accuracy={accuracy} />)
    const cover = screen.getByRole('img', {
      name: '지난 예측과 실제 출고, 버텼는지',
    })
    expect(cover.querySelectorAll('rect[data-out]')).toHaveLength(1)
    expect(cover).toHaveTextContent('품절')
    const miss = screen.getByRole('img', { name: '지난 예측이 빗나간 정도' })
    expect(miss).toHaveTextContent('+27%')
    expect(miss).not.toHaveTextContent('-8%')
  })

  it('맞춰 본 자료가 없으면 이유만 한 줄로 두고 그래프를 만들지 않는다', () => {
    const view = render(
      <AccuracyCard
        accuracy={{
          ...accuracy,
          history: [],
          evaluation: { ...accuracy.evaluation!, status: 'EMPTY' },
        }}
      />,
    )
    expect(
      screen.getByText(/맞춰 볼 수 있는 지난 자료가 없어/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    view.rerender(
      <AccuracyCard
        accuracy={{
          ...accuracy,
          history: [],
          evaluation: { ...accuracy.evaluation!, status: 'UNAVAILABLE' },
        }}
      />,
    )
    expect(screen.getByText(/맞춰 보기를 하지 않았어요/)).toBeInTheDocument()
    view.rerender(
      <AccuracyCard
        accuracy={{ ...accuracy, history: [], evaluation: null }}
      />,
    )
    expect(screen.getByText(/맞춰 보기 자료가 아직 없어요/)).toBeInTheDocument()
  })

  it('실제 출고 합계가 0이어도 버틴 비율은 두고 빗나간 정도를 못 내는 이유를 보여 준다', () => {
    render(
      <AccuracyCard
        accuracy={{
          ...accuracy,
          coverSuccess: 1,
          coverTrials: 1,
          errorRate: null,
          history: [point('2026-09-01', 0, 0)],
        }}
      />,
    )
    expect(screen.getByText('정확도 높음')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(
      screen.getByText(/실제 출고가 0이라 빗나간 정도를 계산할 수 없어요/),
    ).toBeInTheDocument()
  })
})
