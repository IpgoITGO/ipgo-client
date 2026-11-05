import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PasswordField } from './PasswordField'
import { PasswordStrength } from './PasswordStrength'

describe('PasswordStrength', () => {
  it('조건 5줄을 늘 보여 주고 채운 줄만 충족으로 읽힌다', () => {
    render(<PasswordStrength value="abcd1" />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items.map((item) => item.textContent)).toEqual([
      '미충족: 8~16자',
      '미충족: 영문 대문자 1개 이상',
      '충족: 영문 소문자 1개 이상',
      '충족: 숫자 1개 이상',
      '미충족: 특수문자 1개 이상',
    ])
  })
})

describe('PasswordField', () => {
  it('한글·공백은 들어오자마자 지우고 알린다', async () => {
    const onChange = vi.fn()
    render(<PasswordField label="비밀번호" onChange={onChange} />)
    const input = screen.getByLabelText('비밀번호')
    await userEvent.type(input, 'Ab 가1')
    expect(input).toHaveValue('Ab1')
    expect(screen.getByRole('status')).toHaveTextContent('한글·공백은 못 써요')
  })

  it('보기 버튼으로 적은 글자를 보여 준다', async () => {
    render(<PasswordField label="비밀번호" />)
    const input = screen.getByLabelText('비밀번호')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: '비밀번호 보기' }))
    expect(input).toHaveAttribute('type', 'text')
  })
})
