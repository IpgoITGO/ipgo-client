import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toast } from './Toast'

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('정해진 시간이 지나면 서서히 사라진 뒤 닫는다', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Toast message="저장했어요" onClose={onClose} duration={1500} />)

    expect(screen.getByRole('status')).toHaveTextContent('저장했어요')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1499)
    })
    expect(onClose).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    // 사라지는 움직임(0.42초)이 끝나야 닫는다
    expect(screen.getByRole('status')).toHaveAttribute('data-leaving', 'true')
    expect(onClose).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(420)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
