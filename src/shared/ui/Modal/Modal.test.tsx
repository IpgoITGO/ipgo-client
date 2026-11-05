import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
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

  // 버그(11/5): 부모가 onClose를 매 렌더 새로 만들면, 글자를 칠 때마다 창이 초점을 가져가
  // 상품 검색칸에 한 글자만 들어갔다.
  it('안의 입력칸에 여러 글자를 칠 수 있다', async () => {
    const user = userEvent.setup()
    function Search() {
      const [text, setText] = useState('')
      return (
        <Modal labelledBy="dialog-title" onClose={() => setText('')}>
          <h2 id="dialog-title">검색</h2>
          <input
            aria-label="상품 검색"
            onChange={(event) => setText(event.target.value)}
            value={text}
          />
        </Modal>
      )
    }

    render(<Search />)
    await user.click(screen.getByLabelText('상품 검색'))
    await user.keyboard('덴탈껌')
    expect(screen.getByLabelText('상품 검색')).toHaveValue('덴탈껌')
  })
})
