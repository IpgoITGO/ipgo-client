import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { demoSubscription, saveSubscription } from '../model/billing'
import { PlansPage } from './PlansPage'

const TODAY = new Date(2026, 10, 6)

function show(sub: ReturnType<typeof demoSubscription>) {
  saveSubscription(sub)
  render(
    <MemoryRouter>
      <PlansPage />
    </MemoryRouter>,
  )
  return screen.getByRole('region', { name: '지금 상태' })
}

// 체험 시작일로 남은 날을 맞춘다(끝나는 날 = 시작 + 14일)
const trialWith = (startedOn: string) => ({
  ...demoSubscription('trial', TODAY),
  startedOn,
})

describe('요금제 상태 줄', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it('10일 남음: 초록 원 D-10, 14일 체험 쓰는 중, 11/16까지, 꼬리표와 14칸 막대', () => {
    const bar = show(trialWith('2026-11-02'))
    expect(bar).toHaveTextContent('D-10')
    expect(bar).toHaveTextContent('14일 체험 쓰는 중')
    expect(bar).toHaveTextContent('11/16까지 셀러와 똑같이 써요')
    expect(bar).not.toHaveAttribute('data-state')
    expect(screen.getByText('지금 쓰는 중')).toBeInTheDocument()
    expect(screen.getByText('10일 남음')).toBeInTheDocument()
  })

  it('2일 남음: 노랑, 셀러로 이어 쓰기 버튼', () => {
    const bar = show(trialWith('2026-10-25'))
    expect(bar).toHaveTextContent('D-2')
    expect(bar).toHaveTextContent('체험이 2일 남았어요')
    expect(bar).toHaveTextContent('11/8에 새 계산이 멈춰요')
    expect(bar).toHaveAttribute('data-state', 'soon')
    expect(
      screen.getByRole('button', { name: '셀러로 이어 쓰기' }),
    ).toBeInTheDocument()
  })

  it('끝남: 끝, 체험이 끝났어요, 체험 끝 도장, 꼬리표 없음', () => {
    const bar = show(demoSubscription('trial-ended', TODAY))
    expect(bar).toHaveTextContent('끝')
    expect(bar).toHaveTextContent('체험이 끝났어요')
    expect(bar).toHaveTextContent('자료는 그대로 볼 수 있어요')
    expect(screen.getByText('체험 끝')).toBeInTheDocument()
    expect(screen.queryByText('지금 쓰는 중')).not.toBeInTheDocument()
  })

  it('셀러: 쓰는 중 · 다음 결제일, 셀러 카드에 꼬리표, 도장 없음', () => {
    const bar = show(demoSubscription('seller', TODAY))
    expect(bar).toHaveTextContent('셀러 쓰는 중 · 다음 결제 12/5')
    expect(bar).not.toHaveTextContent('D-')
    expect(screen.getByText('지금 쓰는 중')).toBeInTheDocument()
    expect(screen.queryByText('체험 끝')).not.toBeInTheDocument()
  })
})
