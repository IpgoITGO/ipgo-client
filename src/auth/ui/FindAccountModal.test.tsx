import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FindAccountModal } from './FindAccountModal'

function setup() {
  const onDone = vi.fn()
  const onClose = vi.fn()
  render(<FindAccountModal onClose={onClose} onDone={onDone} />)
  return { onDone, onClose, user: userEvent.setup() }
}

describe('FindAccountModal', () => {
  it('비밀번호를 찾아 바꾸고 로그인 화면으로 돌아간다', async () => {
    const { user, onDone } = setup()

    await user.click(screen.getByRole('tab', { name: '비밀번호 찾기' }))
    await user.type(screen.getByLabelText('이메일'), 'seller@a.com')
    await user.click(screen.getByRole('button', { name: '코드 보내기' }))

    await user.type(await screen.findByLabelText('인증 코드'), '000000')
    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('코드가 맞지 않아요.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('인증 코드'))
    await user.type(screen.getByLabelText('인증 코드'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))

    await user.type(await screen.findByLabelText('새 비밀번호'), 'Abcd1234!')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'Abcd1234!')
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }))

    expect(await screen.findByText('비밀번호를 바꿨어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '로그인하기' }))
    expect(onDone).toHaveBeenCalledWith('seller@a.com')
  })

  it('비밀번호가 서로 다르면 칸 아래에 알려 준다', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('tab', { name: '비밀번호 찾기' }))
    await user.type(screen.getByLabelText('이메일'), 'seller@a.com')
    await user.click(screen.getByRole('button', { name: '코드 보내기' }))
    await user.type(await screen.findByLabelText('인증 코드'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))
    await user.type(await screen.findByLabelText('새 비밀번호'), 'Abcd1234!')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'Abcd1234?')
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }))

    expect(await screen.findByText('비밀번호가 서로 달라요.')).toBeVisible()
  })

  it('사업자등록번호로 가린 이메일을 찾는다', async () => {
    const { user, onDone } = setup()

    await user.type(screen.getByLabelText('사업자등록번호'), '1234567890')
    expect(screen.getByLabelText('사업자등록번호')).toHaveValue('123-45-67890')
    await user.click(screen.getByRole('button', { name: '아이디 찾기' }))

    expect(await screen.findByText('se***@a.com 이에요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '이 이메일로 로그인' }))
    expect(onDone).toHaveBeenCalledWith()
  })

  it('없는 번호면 계정이 없다고 알려 준다', async () => {
    const { user } = setup()

    await user.type(screen.getByLabelText('사업자등록번호'), '9999999999')
    await user.click(screen.getByRole('button', { name: '아이디 찾기' }))

    expect(
      await screen.findByText('이 번호로 가입한 계정이 없어요.'),
    ).toBeInTheDocument()
  })

  it('Esc로 닫힌다', async () => {
    const { user, onClose } = setup()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
