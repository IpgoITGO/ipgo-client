import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'

import { signupPolicy } from '../model/signupPolicy'
import { PolicyLinks, PolicyPage } from './PolicyPages'

it('미확정 문서를 동의 대상으로 공개하지 않는다', () => {
  expect(signupPolicy).toBeNull()
  render(
    <MemoryRouter>
      <PolicyLinks />
      <PolicyPage kind="terms" />
    </MemoryRouter>,
  )
  expect(screen.getByText('문서를 준비하고 있어요.')).toBeVisible()
  expect(
    screen.queryByRole('navigation', { name: '약관과 개인정보' }),
  ).toBeNull()
})
