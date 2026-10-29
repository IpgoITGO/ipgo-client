import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toast } from './Toast'

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('정해진 시간이 지나면 저절로 닫는다', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Toast message="저장했어요" onClose={onClose} duration={3000} />)

    expect(screen.getByRole('status')).toHaveTextContent('저장했어요')
    act(() => {
      vi.advanceTimersByTime(2999)
    })
    expect(onClose).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
