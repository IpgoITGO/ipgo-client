import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CancelModal } from './CancelModal'

// 대시보드 결과를 미리 넣어 두고(요청 없이) 해지 팝업 1단계를 그린다
function renderWith(neededItems: unknown[] | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  })
  if (neededItems) {
    client.setQueryData(['dashboard'], {
      neededItems,
      summary: { needed: neededItems.length },
    })
  }
  render(
    <QueryClientProvider client={client}>
      <CancelModal nextOn="2026-12-05" onCancel={() => {}} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

describe('CancelModal 1단계 그림', () => {
  it('결과가 없거나 빈 목록이면 예시라고 밝히고 실제 상품처럼 보이지 않게 한다', () => {
    for (const items of [null, []]) {
      renderWith(items)
      expect(
        screen.getByText('아직 계산 결과가 없어 아래 그림은 예시예요'),
      ).toBeInTheDocument()
      expect(screen.getAllByText('지금 · 예시').length).toBeGreaterThan(0)
      expect(screen.queryByText(/케어트릿/)).not.toBeInTheDocument()
      cleanup()
    }
  })

  it('실제 상품의 위험이 아직 없으면 숫자를 지어내지 않는다', () => {
    renderWith([
      {
        id: '1',
        name: '실제 상품',
        barcode: '1',
        stockoutDate: '2026. 11. 7',
        leadTime: 5,
        quantity: 30,
        cost: 0,
        risk: null,
      },
    ])
    expect(
      screen.queryByText('아직 계산 결과가 없어 아래 그림은 예시예요'),
    ).not.toBeInTheDocument()
    expect(screen.getAllByText('실제 상품').length).toBeGreaterThan(0)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByText('9%')).not.toBeInTheDocument()
  })
})
