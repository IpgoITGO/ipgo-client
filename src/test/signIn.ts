import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

// 로그인 화면에서 시험 계정으로 로그인합니다.
// 글자를 하나씩 치면 느린 환경에서 테스트 시간이 넘을 수 있어 붙여 넣습니다.
export async function signInAsSeller(user: UserEvent) {
  await user.click(await screen.findByLabelText('이메일'))
  await user.paste('seller@a.com')
  await user.click(screen.getByLabelText('비밀번호'))
  await user.paste('pass1234')
  await user.click(screen.getByRole('button', { name: '로그인' }))
}
