import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Modal } from './Modal'

describe('Modal', () => {
  it('Escape으로 닫을 수 있다', async () => {
    const close = vi.fn()
    const user = userEvent.setup()

    render(
      <Modal labelledBy="dialog-title" onClose={close}>
        <h2 id="dialog-title">확인</h2>
      </Modal>,
    )

    expect(screen.getByRole('dialog', { name: '확인' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(close).toHaveBeenCalledOnce()
  })
})
