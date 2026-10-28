import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { useActionLock } from './useActionLock'

function ActionHarness({ action }: { action: () => Promise<void> }) {
  const { isPending, run } = useActionLock(action)

  return (
    <button onClick={() => void run()}>{isPending ? '진행 중' : '실행'}</button>
  )
}

describe('useActionLock', () => {
  it('처리 중 중복 실행을 막는다', async () => {
    let finish: (() => void) | undefined
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const user = userEvent.setup()

    render(<ActionHarness action={action} />)

    const button = screen.getByRole('button', { name: '실행' })
    await user.dblClick(button)
    expect(action).toHaveBeenCalledOnce()

    finish?.()
  })
})
