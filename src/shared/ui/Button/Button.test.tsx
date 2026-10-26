import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'

describe('Button', () => {
  it('사용자의 클릭을 전달한다', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(<Button onClick={onClick}>확인</Button>)
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(onClick).toHaveBeenCalledOnce()
  })
})
