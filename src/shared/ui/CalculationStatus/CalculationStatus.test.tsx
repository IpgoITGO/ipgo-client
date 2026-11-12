import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CalculationContext,
  type CalculationState,
} from '../../api/calculationContext'
import { CalculationStatus, DONE_MS } from './CalculationStatus'

function view(phase: CalculationState['phase'], runId = 1) {
  return (
    <CalculationContext.Provider
      value={{
        phase,
        runId,
        busy: phase === 'pending',
        trackUpload: vi.fn(),
        trackRun: vi.fn(),
        retry: vi.fn(),
        dismiss: vi.fn(),
        stop: vi.fn(),
      }}
    >
      <CalculationStatus />
    </CalculationContext.Provider>
  )
}

describe('계산 상태 접힘 초기화', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('완료 알림을 닫고 빠르게 다시 계산해도 새 완료 창을 펼친다', () => {
    const { rerender } = render(view('done'))
    act(() => vi.advanceTimersByTime(DONE_MS))
    expect(screen.getByText('계산 끝')).toBeInTheDocument()
    rerender(view('idle'))
    rerender(view('pending', 2))
    rerender(view('done', 2))
    expect(screen.getByText('계산을 마쳤어요')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(DONE_MS - 1))
    expect(screen.getByText('계산을 마쳤어요')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText('계산 끝')).toBeInTheDocument()
  })

  it('재확인으로 같은 단계에 돌아오거나 계산 번호가 바뀌면 펼친다', () => {
    const { rerender } = render(view('pending'))
    act(() => vi.advanceTimersByTime(DONE_MS))
    expect(screen.getByText('계산 중')).toBeInTheDocument()
    rerender(view('unknown'))
    rerender(view('pending'))
    expect(screen.getByText('입고량을 계산하고 있어요')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(DONE_MS))
    rerender(view('pending', 2))
    expect(screen.getByText('입고량을 계산하고 있어요')).toBeInTheDocument()
  })

  it('단계가 바뀌거나 마우스가 떠나도 포커스가 있으면 접지 않는다', () => {
    const { rerender } = render(view('pending'))
    const box = screen.getByRole('region', { name: '입고량 계산 상태' })
    fireEvent.mouseEnter(box)
    fireEvent.focus(screen.getByRole('button', { name: '계산 멈추기' }))
    rerender(view('unknown'))
    fireEvent.mouseLeave(box)
    act(() => vi.advanceTimersByTime(DONE_MS * 2))
    expect(
      screen.getByText('계산 결과를 다시 확인해 주세요'),
    ).toBeInTheDocument()
    fireEvent.blur(screen.getByRole('button', { name: '상태 다시 확인' }))
    act(() => vi.advanceTimersByTime(DONE_MS))
    expect(screen.getByText('계산 확인 필요')).toBeInTheDocument()
  })
})
