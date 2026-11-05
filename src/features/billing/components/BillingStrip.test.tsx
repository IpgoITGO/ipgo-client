import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { demoSubscription } from '../model/billing'
import { BillingStrip } from './BillingStrip'

const today = new Date()
const show = (
  name: Parameters<typeof demoSubscription>[0],
  path = '/dashboard',
) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <BillingStrip subscription={demoSubscription(name, today)} />
    </MemoryRouter>,
  )

describe('결제 띠', () => {
  it('체험 끝·결제 실패·마감 지남마다 한 줄과 링크 하나', () => {
    show('trial-ended')
    expect(screen.getByRole('link', { name: '요금제 고르기' })).toHaveAttribute(
      'href',
      '/plans',
    )
    expect(screen.getByText('체험이 끝났어요.')).toBeInTheDocument()
  })
  it('결제 실패는 마감 날짜, 지나면 멈췄다고', () => {
    const { unmount } = show('pay-failed')
    expect(screen.getByText(/까지 바꾸지 않으면 새 계산이/)).toBeInTheDocument()
    unmount()
    show('pay-locked')
    expect(
      screen.getByText('결제가 안 돼서 새 계산이 멈췄어요.'),
    ).toBeInTheDocument()
  })
  it('정상·결제 화면에서는 안 띄운다', () => {
    const { container, unmount } = show('seller')
    expect(container).toBeEmptyDOMElement()
    unmount()
    expect(
      show('pay-failed', '/checkout?plan=seller').container,
    ).toBeEmptyDOMElement()
  })
})
