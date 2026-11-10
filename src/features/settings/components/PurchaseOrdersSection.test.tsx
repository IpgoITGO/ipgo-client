import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { PurchaseOrdersSection } from './PurchaseOrdersSection'

function renderSection() {
  render(
    <AppProviders>
      <PurchaseOrdersSection />
    </AppProviders>,
  )
}

describe('PurchaseOrdersSection', () => {
  it('상품 칸 하나에 치면 아래에 후보가 뜨고, 골라서 도착일 없이 저장하면 계산 제외를 안내한다', async () => {
    const user = userEvent.setup()
    renderSection()
    expect(await screen.findByText('케어트릿 120g')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '등록' }))
    await user.type(screen.getByRole('combobox', { name: '상품' }), '덴탈')
    await user.click(
      await screen.findByRole('option', { name: /덴탈껌 S 10입/ }),
    )
    expect(screen.getByRole('combobox', { name: '상품' })).toHaveValue(
      '덴탈껌 S 10입',
    )
    await user.clear(screen.getByLabelText('수량'))
    await user.type(screen.getByLabelText('수량'), '25')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('25개')).toBeInTheDocument()
    expect(screen.getAllByText('도착일 없어 반영 안 돼요')).toHaveLength(2)
  })

  it('판매 중지 상품은 후보에 없고, 상품을 고르지 않으면 저장하지 않는다', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(await screen.findByRole('button', { name: '등록' }))

    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('상품을 골라 주세요.')).toBeInTheDocument()

    await user.type(screen.getByRole('combobox', { name: '상품' }), '단종')
    expect(
      await screen.findByRole('option', { name: '검색 결과가 없어요' }),
    ).toBeInTheDocument()
  })

  it('도착일이 지난 발주는 오늘 달 달력으로 열고, 지난 날은 못 고른다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T12:00:00'))
    const user = userEvent.setup()
    renderSection()
    await user.click(
      await screen.findByRole('button', { name: '동결건조 큐브 50g 수정' }),
    )
    expect(screen.getByLabelText('수량')).toHaveValue(30)
    expect(screen.getByRole('note')).toHaveTextContent('2026-10-16')
    // 오늘 달(11월)부터 열리고, 오늘 전 날은 막혀 있다
    expect(screen.getByRole('button', { name: '11월 9일' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '이전 달' }))
    expect(
      screen.getByRole('button', { name: '10월 16일 (지난 도착일)' }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '다음 달' }))

    await user.clear(screen.getByLabelText('수량'))
    await user.type(screen.getByLabelText('수량'), '45')
    await user.click(screen.getByRole('button', { name: '11월 20일' }))
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('45개')).toBeInTheDocument()
    expect(screen.getByText('11/20 (금)')).toBeInTheDocument()
    expect(screen.queryByText('30개')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('목록 ×는 바로 취소하고, 4초 안에 되돌리면 다시 들어온다', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(
      await screen.findByRole('button', { name: '저키 스틱 100g 발주 취소' }),
    )
    expect(
      await screen.findByText(/저키 스틱 100g 40개 발주를 취소했어요/),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4))
    await user.click(screen.getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(5))
  })

  it('발주 취소는 한 번 더 눌러야 실행되고, 목록에서 빠진다', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(
      await screen.findByRole('button', { name: '저키 스틱 100g 수정' }),
    )

    await user.click(screen.getByRole('button', { name: '발주 취소' }))
    expect(
      screen.getByRole('button', { name: '정말 취소하기' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '정말 취소하기' }))

    await waitFor(() =>
      expect(screen.queryByText('저키 스틱 100g')).not.toBeInTheDocument(),
    )
    expect(screen.getAllByRole('row')).toHaveLength(4)
  })

  it('서버가 수량 칸을 거절하면 그 칸 아래에 알려 준다', async () => {
    const user = userEvent.setup()
    server.use(
      http.patch('/api/planned-receipts/:receiptId', () =>
        HttpResponse.json(
          {
            code: 'INVALID_INPUT',
            message: '입력값',
            details: { field: 'quantity' },
          },
          { status: 400 },
        ),
      ),
    )
    renderSection()
    await user.click(
      await screen.findByRole('button', { name: '케어트릿 120g 수정' }),
    )
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(
      await screen.findByText('1 이상의 정수로 넣어 주세요.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '이미 발주한 물량 수정' }),
    ).toBeInTheDocument()
  })

  it('목록을 못 불러오면 오류를 보여 준다', async () => {
    server.use(
      http.get('/api/planned-receipts', () =>
        HttpResponse.json(
          { code: 'INTERNAL_ERROR', message: '잠시 후 다시 시도해 주세요.' },
          { status: 500 },
        ),
      ),
    )
    renderSection()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '발주 물량을 불러오지 못했어요.',
    )
  })
})
