import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { SettingsPage } from './SettingsPage'

describe('SettingsPage', () => {
  it('상품을 검색하고 잘못된 입고 단위를 차단한다', async () => {
    const user = userEvent.setup()
    render(
      <AppProviders>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </AppProviders>,
    )

    expect(await screen.findByText('케어트릿 120g')).toBeInTheDocument()
    await user.type(screen.getByLabelText('상품명 또는 바코드 검색'), '덴탈껌')
    const productSection = screen
      .getByRole('heading', { name: '상품별로 다른 조건' })
      .closest('section')
    expect(productSection).not.toBeNull()
    expect(
      within(productSection!).getByText('덴탈껌 S 10입'),
    ).toBeInTheDocument()
    expect(
      within(productSection!).queryByText('케어트릿 120g'),
    ).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('덴탈껌 S 10입 inboundUnit'))
    await user.type(screen.getByLabelText('덴탈껌 S 10입 inboundUnit'), '0')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('1 이상의 정수')
  })
})
