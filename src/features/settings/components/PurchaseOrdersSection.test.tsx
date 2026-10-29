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

  it('도착일이 지난 발주도 수정으로 열고, 달력에서 새 도착일을 골라 바꾼다', async () => {
    const user = userEvent.setup()
    render(
      <AppProviders>
        <PurchaseOrdersSection />
      </AppProviders>,
    )
    await user.click(
      await screen.findByRole('button', {
        name: '동결건조 큐브 50g 수정',
      }),
    )
    expect(
      screen.getByRole('heading', { name: '이미 발주한 물량 수정' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('수량')).toHaveValue(30)
    // 지난 도착일을 알려 주고 달력에 빨간 점으로 짚는다
    expect(screen.getByRole('note')).toHaveTextContent('2026-10-16')
    expect(
      screen.getByRole('button', { name: '10월 16일 (지난 도착일)' }),
    ).toBeInTheDocument()

    await user.clear(screen.getByLabelText('수량'))
    await user.type(screen.getByLabelText('수량'), '45')
    await user.click(screen.getByRole('button', { name: '다음 달' }))
    await user.click(screen.getByRole('button', { name: '11월 2일' }))
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('45개')).toBeInTheDocument()
    expect(screen.getByText('2026-11-02')).toBeInTheDocument()
    expect(screen.queryByText('30개')).not.toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(5)
  })
})
