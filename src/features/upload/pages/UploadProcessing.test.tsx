import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LONG_WAIT_SECONDS, UploadProcessing } from './UploadProcessing'

describe('UploadProcessing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('2분이 넘기 전에는 오래 걸림 안내를 보여주지 않는다', () => {
    render(<UploadProcessing onGoDashboard={vi.fn()} />)

    expect(screen.getByText('수불부를 확인하고 있어요')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime((LONG_WAIT_SECONDS - 1) * 1000)
    })

    expect(screen.queryByText('생각보다 오래 걸려요')).not.toBeInTheDocument()
  })

  it('2분이 넘으면 닫아도 처리가 계속된다는 안내와 대시보드 버튼을 보여준다', () => {
    const onGoDashboard = vi.fn()
    render(<UploadProcessing onGoDashboard={onGoDashboard} />)

    act(() => {
      vi.advanceTimersByTime((LONG_WAIT_SECONDS + 14) * 1000)
    })

    expect(screen.getByText('생각보다 오래 걸려요')).toBeInTheDocument()
    expect(
      screen.getByText(
        '창을 닫아도 처리는 계속돼요. 끝나면 대시보드에서 볼 수 있어요.',
      ),
    ).toBeInTheDocument()
    // 지난 시간은 화면에만 보이고 화면 읽기에서는 뺀다
    expect(screen.getByText('2분 14초째')).toHaveAttribute(
      'aria-hidden',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: '대시보드로' }))
    expect(onGoDashboard).toHaveBeenCalledOnce()
  })

  it('끝나면 같은 장면에서 마침 문구로 바뀌고 안내 띠는 사라진다', () => {
    const { rerender } = render(<UploadProcessing onGoDashboard={vi.fn()} />)

    act(() => {
      vi.advanceTimersByTime((LONG_WAIT_SECONDS + 1) * 1000)
    })
    expect(screen.getByText('생각보다 오래 걸려요')).toBeInTheDocument()

    rerender(<UploadProcessing done onGoDashboard={vi.fn()} />)

    expect(screen.getByText('수불부 확인을 마쳤어요')).toBeInTheDocument()
    expect(screen.queryByText('생각보다 오래 걸려요')).not.toBeInTheDocument()
  })
})
