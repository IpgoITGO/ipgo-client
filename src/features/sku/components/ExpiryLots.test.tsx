import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { ExpiryLots } from './ExpiryLots'

const lot = (over: Record<string, unknown>) => ({
  productId: 7,
  skuBarcode: '8800000000007',
  skuName: '연어 져키 80g',
  receivedOn: '2026-08-18',
  expiryDate: '2026-11-16',
  daysLeft: -2,
  remainingQty: 6,
  status: 'EXPIRED',
  ...over,
})

const answer = (items: unknown[]) =>
  server.use(
    http.get('/api/expiry', () =>
      HttpResponse.json({
        asOfDate: '2026-11-18',
        imminentDays: 30,
        summary: { expired: 0, imminent: 0, ok: 0, unknown: 0 },
        items,
      }),
    ),
  )

const show = (openOn?: string) =>
  render(
    <AppProviders>
      <ExpiryLots openOn={openOn} productId="7" />
    </AppProviders>,
  )

describe('상품 상세 유통기한 표시(#434)', () => {
  it('지났거나 임박한 묶음이 없으면 아무것도 보이지 않는다', async () => {
    answer([lot({ status: 'OK', daysLeft: 80 }), lot({ productId: 8 })])
    const { container } = show()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(container).toBeEmptyDOMElement()
  })

  it('표시를 누르면 급한 순서로 묶음을 보여 주고, 알림에서 오면 열린 채로 그 줄을 짚는다', async () => {
    answer([
      lot({
        expiryDate: '2027-02-06',
        daysLeft: 80,
        remainingQty: 32,
        status: 'OK',
      }),
      lot({
        expiryDate: '2026-11-25',
        daysLeft: 7,
        remainingQty: 3,
        status: 'IMMINENT',
      }),
      lot({}),
      lot({ remainingQty: 0, expiryDate: '2026-10-01', daysLeft: -48 }),
    ])
    show('2026-11-16')
    expect(
      await screen.findByRole('button', { name: /유통기한 지남 · 6개/ }),
    ).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('dialog', { name: '유통기한 묶음' })
    // 요약 한 줄은 이름 옆 표시와 겹쳐서 없다
    expect(panel).not.toHaveTextContent('묶음 ·')
    const rows = within(panel).getAllByRole('row').slice(1)
    // 남은 개수 0인 묶음은 빼고, 지남 → 임박 → 정상
    expect(rows.map((row) => row.textContent)).toEqual([
      '2026.11.162026.08.186개2일 지남',
      '2026.11.252026.08.183개D-7',
      '2027.02.062026.08.1832개정상',
    ])
    expect(rows[0]).toHaveAttribute('data-hit')

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
