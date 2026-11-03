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

  it('loader를 주면 불러오는 중에 기본 로고와 막대 대신 그 장면을 보여준다', () => {
    const { container } = render(
      <AsyncState
        description="입고 판단에 필요한 기록을 모으고 있어요."
        loader={<div data-testid="box-loader" />}
        status="loading"
        title="상품 상세를 불러오고 있어요"
      />,
    )

    expect(screen.getByTestId('box-loader')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('오류일 때는 loader를 줘도 쓰지 않는다', () => {
    render(
      <AsyncState
        description="잠시 후 다시 시도해 주세요."
        loader={<div data-testid="box-loader" />}
        status="error"
        title="불러오지 못했어요"
      />,
    )

    expect(screen.queryByTestId('box-loader')).toBeNull()
  })
})
