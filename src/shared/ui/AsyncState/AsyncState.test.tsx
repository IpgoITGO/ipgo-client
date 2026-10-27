import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AsyncState } from './AsyncState'

describe('AsyncState', () => {
  it('오류와 재시도 action을 제공한다', async () => {
    const retry = vi.fn()
    const user = userEvent.setup()

    render(
      <AsyncState
        description="잠시 후 다시 시도해 주세요."
        onRetry={retry}
        status="error"
        title="불러오지 못했어요"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('불러오지 못했어요')
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('로딩 상태를 polite live region으로 알린다', () => {
    render(
      <AsyncState
        description="계산 결과를 준비하고 있어요."
        status="loading"
        title="계산 중"
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('계산 중')
  })
})
