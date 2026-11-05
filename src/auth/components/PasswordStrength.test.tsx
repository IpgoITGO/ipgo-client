import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PasswordStrength } from './PasswordStrength'

describe('PasswordStrength', () => {
  it('빠진 조건만 알려 준다', () => {
    render(<PasswordStrength value="abcd" />)
    expect(screen.getByRole('img')).toHaveAccessibleName(
      '비밀번호 조건 5개 중 1개 충족',
    )
    expect(
      screen.getByText(
        '대문자·숫자·특수문자를 넣어 주세요. 8자 이상으로 해 주세요.',
      ),
    ).toBeInTheDocument()
  })

  it('규칙을 다 채우면 쓸 수 있다고 알린다', () => {
    render(<PasswordStrength value="Abcd1234!" />)
    expect(screen.getByText('쓸 수 있는 비밀번호예요.')).toBeInTheDocument()
  })

  it('공백·한글을 막는다', () => {
    render(<PasswordStrength value="Abcd 1234!" />)
    expect(screen.getByText('공백·한글은 쓸 수 없어요.')).toBeInTheDocument()
  })
})
