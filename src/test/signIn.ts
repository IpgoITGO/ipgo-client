import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

// 로그인 화면에서 시험 계정으로 로그인합니다.
export async function signInAsSeller(user: UserEvent) {
  await user.type(await screen.findByLabelText('이메일'), 'seller@a.com')
  await user.type(screen.getByLabelText('비밀번호'), 'pass1234')
  await user.click(screen.getByRole('button', { name: '로그인' }))
}
