import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState } from 'react'
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

function FocusExample({ removeOpener = false }: { removeOpener?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {(!open || !removeOpener) && (
        <button onClick={() => setOpen(true)}>열기</button>
      )}
      {open && (
        <Modal labelledBy="focus-title" onClose={() => setOpen(false)}>
          <h2 id="focus-title">초점 검사</h2>
          <button autoFocus onClick={() => setOpen(false)}>
            닫기
          </button>
        </Modal>
      )}
    </>
  )
}

it.each([false, true])(
  '실제 Escape 닫힘 뒤 열기 버튼으로 복원한다 (StrictMode=%s)',
  async (strict) => {
    const user = userEvent.setup()
    render(
      strict ? (
        <StrictMode>
          <FocusExample />
        </StrictMode>
      ) : (
        <FocusExample />
      ),
    )
    const opener = screen.getByRole('button', { name: '열기' })
    await user.click(opener)
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  },
)

it('닫기 버튼과 외부 언마운트도 연결된 열기 버튼에 복원한다', async () => {
  const user = userEvent.setup()
  const view = render(<FocusExample />)
  const opener = screen.getByRole('button', { name: '열기' })
  await user.click(opener)
  await user.click(screen.getByRole('button', { name: '닫기' }))
  expect(opener).toHaveFocus()
  await user.click(opener)
  view.rerender(<button>다른 화면</button>)
  expect(document.activeElement).toBe(document.body)
})

it('열기 버튼이 제거되어도 닫힘을 안전하게 처리한다', async () => {
  const user = userEvent.setup()
  render(<FocusExample removeOpener />)
  await user.click(screen.getByRole('button', { name: '열기' }))
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.activeElement).toBe(document.body)
})

it('중첩 모달의 Escape은 안쪽만 닫고 안쪽 열기 버튼에 복원한다', async () => {
  const user = userEvent.setup()
  function Nested() {
    const [outer, setOuter] = useState(false)
    return (
      <>
        <button onClick={() => setOuter(true)}>바깥 열기</button>
        {outer && (
          <Modal labelledBy="outer-title" onClose={() => setOuter(false)}>
            <h2 id="outer-title">바깥</h2>
            <FocusExample />
          </Modal>
        )}
      </>
    )
  }
  render(<Nested />)
  const outer = screen.getByRole('button', { name: '바깥 열기' })
  await user.click(outer)
  const inner = screen.getByRole('button', { name: '열기' })
  await user.click(inner)
  await user.keyboard('{Escape}')
  expect(screen.getByRole('dialog', { name: '바깥' })).toBeInTheDocument()
  expect(inner).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(outer).toHaveFocus()
})

it('부모의 직접 언마운트 뒤에도 남아 있는 열기 버튼으로 복원한다', () => {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const view = render(
    <Modal labelledBy="unmount-title">
      <h2 id="unmount-title">직접 닫힘</h2>
    </Modal>,
  )
  expect(screen.getByRole('dialog')).toHaveFocus()
  view.unmount()
  expect(opener).toHaveFocus()
  opener.remove()
})
