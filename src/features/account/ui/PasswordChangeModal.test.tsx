import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { openApp } from '../../../test/openApp'

// 로그인한 채로 비밀번호 바꾸기(server #194). 가짜 서버 시험 계정의 지금 비밀번호는 pass1234
describe('내 계정 비밀번호 바꾸기', () => {
  async function openDialog() {
    const { user } = await openApp('/account')
    await user.click(await screen.findByRole('button', { name: '바꾸기' }))
    const dialog = await screen.findByRole('dialog', {
      name: '비밀번호 바꾸기',
    })
    return { user, dialog }
  }

  it('지금 비밀번호가 틀리면 그 칸에 알려 준다', async () => {
    const { user, dialog } = await openDialog()
    await user.type(within(dialog).getByLabelText('지금 비밀번호'), 'wrong999')
    await user.type(within(dialog).getByLabelText('새 비밀번호'), 'Newpass1!')
    await user.type(
      within(dialog).getByLabelText('새 비밀번호 확인'),
      'Newpass1!',
    )
    await user.click(within(dialog).getByRole('button', { name: '바꾸기' }))
    expect(
      await within(dialog).findByText('지금 비밀번호가 맞지 않아요.'),
    ).toBeInTheDocument()
  })

  it('새 비밀번호가 규칙에 안 맞거나 확인과 다르면 보내지 않는다', async () => {
    const { user, dialog } = await openDialog()
    await user.type(within(dialog).getByLabelText('지금 비밀번호'), 'pass1234')
    await user.type(within(dialog).getByLabelText('새 비밀번호'), 'short')
    await user.click(within(dialog).getByRole('button', { name: '바꾸기' }))
    expect(
      await within(dialog).findByText('아래 조건을 모두 채워 주세요.'),
    ).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('새 비밀번호'))
    await user.type(within(dialog).getByLabelText('새 비밀번호'), 'Newpass1!')
    await user.type(
      within(dialog).getByLabelText('새 비밀번호 확인'),
      'Newpass2!',
    )
    await user.click(within(dialog).getByRole('button', { name: '바꾸기' }))
    expect(
      await within(dialog).findByText('새 비밀번호가 서로 달라요.'),
    ).toBeInTheDocument()
  })

  it('맞게 넣으면 창이 닫히고 바뀌었다고 알린다', async () => {
    const { user, dialog } = await openDialog()
    await user.type(within(dialog).getByLabelText('지금 비밀번호'), 'pass1234')
    await user.type(within(dialog).getByLabelText('새 비밀번호'), 'Newpass1!')
    await user.type(
      within(dialog).getByLabelText('새 비밀번호 확인'),
      'Newpass1!',
    )
    await user.click(within(dialog).getByRole('button', { name: '바꾸기' }))
    expect(
      await screen.findByText(
        '비밀번호를 바꿨어요. 다른 기기에서는 로그아웃됐어요',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('dialog', { name: '비밀번호 바꾸기' }),
    ).not.toBeInTheDocument()
  })
})
