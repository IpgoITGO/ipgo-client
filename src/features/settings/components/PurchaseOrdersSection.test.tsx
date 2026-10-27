import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '../../../app/providers/AppProviders'
import { PurchaseOrdersSection } from './PurchaseOrdersSection'

describe('PurchaseOrdersSection', () => {
  it('도착일 없는 발주를 저장하고 계산 제외를 안내한다', async () => {
    const user = userEvent.setup()
    render(
      <AppProviders>
        <PurchaseOrdersSection />
      </AppProviders>,
    )
    expect(await screen.findByText('케어트릿 120g')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '등록' }))
    expect(screen.getByText(/비워 두면 저장은 되지만/)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('수량'))
    await user.type(screen.getByLabelText('수량'), '25')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('25개')).toBeInTheDocument()
    expect(
      screen.getAllByText('도착일 없어 반영 안 돼요').length,
    ).toBeGreaterThan(0)
  })
})
