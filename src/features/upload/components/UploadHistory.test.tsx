import { QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '../../../shared/api/queryClient'
import { type UploadedPeriod } from '../model/uploadApi'

import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { FailedUploadsNotice, UploadHistory } from './UploadHistory'

const item = (uploadId: number, status: 'DONE' | 'FAILED' | 'PROCESSING') => ({
  uploadId,
  status,
  fileName: `수불부${uploadId}.xlsx`,
  period: `2026-0${uploadId}`,
  uploadedAt: '2026-11-16T00:00:00Z',
  periodStart: `2026-0${uploadId}-01`,
  periodEnd: `2026-0${uploadId}-30`,
})
function show(element = <UploadHistory />) {
  render(
    <AppProviders>
      <MemoryRouter>{element}</MemoryRouter>
    </AppProviders>,
  )
}

describe('월별 업로드 내역', () => {
  it('확인한 달을 최신 연도부터 묶고 각 연도는 따로 펼친다', async () => {
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json({
          items: [
            { ...item(1, 'DONE'), period: '2025-12' },
            { ...item(2, 'DONE'), period: '2026-01' },
            { ...item(3, 'DONE'), period: '2026-02' },
          ],
          latestUploadId: 3,
        }),
      ),
    )
    show()
    // 연도마다 한 줄에 12칸. 최신 연도가 위, 올린 달만 눌러서 결과를 열 수 있다
    const latest = await screen.findByRole('group', { name: '2026년' })
    const previous = screen.getByRole('group', { name: '2025년' })
    expect(
      latest.compareDocumentPosition(previous) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      within(latest)
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual([
      '2026년 1월 확인 완료 · 결과 보기',
      '2026년 2월 확인 완료 · 결과 보기',
    ])
    expect(
      within(previous)
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual(['2025년 12월 확인 완료 · 결과 보기'])
    // 안 올린 달은 눌리지 않는 빈 칸
    expect(within(latest).getByText('3월').closest('a')).toBeNull()
  })

  it('실패와 확인 중인 달도 달 칸에 상태로 보이고 위에 실패 이유를 띄운다', async () => {
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json({
          items: [
            item(2, 'DONE'),
            {
              ...item(1, 'FAILED'),
              error: { code: 'INVALID_SOURCE', message: '실패 원인' },
            },
            item(3, 'PROCESSING'),
          ],
          latestUploadId: 3,
        }),
      ),
    )
    show()
    expect(
      await screen.findByText('3개 중 1개 확인 · 1개 실패 · 1개 확인 중'),
    ).toBeVisible()
    // 달 순서대로(1월·2월·3월) 한 칸씩, 상태는 칸의 data-status로
    const year = screen.getByRole('group', { name: '2026년' })
    const months = within(year).getAllByRole('link')
    expect(months.map((link) => link.getAttribute('aria-label'))).toEqual([
      '2026년 1월 확인 실패 · 결과 보기',
      '2026년 2월 확인 완료 · 결과 보기',
      '2026년 3월 확인 중 · 결과 보기',
    ])
    expect(months.map((link) => link.getAttribute('data-status'))).toEqual([
      'FAILED',
      'DONE',
      'PROCESSING',
    ])
    const failures = screen.getByRole('list', { name: '실패한 달' })
    expect(within(failures).getByText('2026년 1월 확인 실패')).toBeVisible()
    expect(within(failures).getByText('실패 원인')).toBeVisible()
  })

  it('새 U3 실패 문장을 바로 표시하고 실패한 월만 재업로드를 제공한다', async () => {
    const detail = vi.fn()
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json({
          items: [
            {
              ...item(1, 'FAILED'),
              error: {
                code: 'INVALID_SOURCE',
                message: '1월 재고를 확인해 주세요.',
              },
            },
            { ...item(2, 'DONE'), error: null },
            { ...item(3, 'PROCESSING'), error: null },
          ],
          latestUploadId: 3,
        }),
      ),
      http.get('/api/uploads/:uploadId', () => {
        detail()
        return HttpResponse.json({})
      }),
    )
    show()
    expect(
      await screen.findByText('1월 재고를 확인해 주세요.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '2026년 2월 확인 완료 · 결과 보기' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '2026년 3월 확인 중 · 결과 보기' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '2026년 1월 다시 올리기' }),
    ).toHaveAttribute('href', '/upload?retry=2026-01')
    expect(
      screen.queryByRole('link', { name: '2026년 2월 다시 올리기' }),
    ).not.toBeInTheDocument()
    expect(detail).not.toHaveBeenCalled()
  })
  it('구 U3이면 실패한 항목만 U2로 보완하며 과거 마감 기록은 재시도하지 않는다', async () => {
    const seen: string[] = []
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json({
          items: [item(1, 'FAILED'), item(2, 'DONE'), item(3, 'FAILED')],
          latestUploadId: 3,
        }),
      ),
      http.get('/api/uploads/:uploadId', ({ params }) => {
        seen.push(String(params.uploadId))
        return HttpResponse.json({
          status: 'FAILED',
          error:
            params.uploadId === '3'
              ? {
                  code: 'LEGACY_UPLOAD_CLOSED',
                  message: '과거 기록을 보존했어요.',
                }
              : { code: 'INVALID_SOURCE', message: '이전 응답의 실패 이유' },
        })
      }),
    )
    show()
    expect(await screen.findByText('이전 응답의 실패 이유')).toBeInTheDocument()
    expect(
      await screen.findByText('2026년 3월 과거 기록 마감'),
    ).toBeInTheDocument()
    expect(seen.sort()).toEqual(['1', '3'])
    expect(
      screen.queryByRole('link', { name: '2026년 3월 다시 올리기' }),
    ).not.toBeInTheDocument()
  })
  it('마지막 업로드가 성공해도 다른 실패 월을 대시보드에 알린다', async () => {
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json({
          items: [item(1, 'FAILED'), item(2, 'DONE')],
          latestUploadId: 2,
        }),
      ),
    )
    show(<FailedUploadsNotice />)
    const notice = await screen.findByText('확인 못 한 달이 있어요')
    expect(notice.closest('aside')).toHaveTextContent('2026년 1월')
    expect(within(notice.closest('aside')!).getByRole('link')).toHaveAttribute(
      'href',
      '/upload',
    )
  })
  it('월별 조회에 실패하면 문제가 없다고 숨기지 않고 조회 실패를 알린다', async () => {
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json(
          { code: 'UNAVAILABLE', message: '연결 실패' },
          { status: 503 },
        ),
      ),
    )
    show(<FailedUploadsNotice />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '월별 업로드 상태를 확인하지 못했어요',
    )
  })
})

function period(
  value: string,
  uploadId: number,
  status: UploadedPeriod['status'] = 'DONE',
): UploadedPeriod {
  return {
    period: value,
    uploadId,
    status,
    fileName: `${uploadId}.xlsx`,
    periodStart: `${value}-01`,
    periodEnd: `${value}-28`,
    uploadedAt: '2026-11-17T09:00:00',
    ...(status === 'FAILED'
      ? { error: { code: 'INVALID_SOURCE', message: '자료 확인 필요' } }
      : {}),
  }
}

function renderHistory(items: UploadedPeriod[]) {
  const client = createQueryClient()
  client.setQueryData(['upload-periods'], { items, latestUploadId: null })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UploadHistory />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('UploadHistory', () => {
  it('자료가 있는 두 해 사이에 빈 해를 만들지 않는다', () => {
    renderHistory([period('2024-03', 1), period('2026-10', 2)])

    const years = screen.getAllByRole('group')
    expect(years.map((year) => year.getAttribute('aria-label'))).toEqual([
      '2026년',
      '2024년',
    ])
    for (const year of years)
      expect(within(year).getAllByRole('listitem')).toHaveLength(12)
  })

  it('먼 미래와 과거가 섞여도 자료가 있는 해만 내림차순으로 그린다', () => {
    renderHistory([
      period('2024-03', 1),
      period('8744-10', 2, 'FAILED'),
      period('1024-01', 3),
      period('2024-12', 4, 'PROCESSING'),
    ])

    const years = screen.getAllByRole('group')
    expect(years.map((year) => year.getAttribute('aria-label'))).toEqual([
      '8744년',
      '2024년',
      '1024년',
    ])
    for (const year of years)
      expect(within(year).getAllByRole('listitem')).toHaveLength(12)
    expect(
      within(years[0]).getByRole('link', { name: /8744년 10월 확인 실패/ }),
    ).toHaveAttribute('href', '/upload/2/result')
    expect(
      within(years[1]).getByRole('link', { name: /2024년 12월 확인 중/ }),
    ).toHaveAttribute('href', '/upload/4/result')
    expect(screen.getByRole('status')).toHaveTextContent(
      '4개 중 2개 확인 · 1개 실패 · 1개 확인 중',
    )
  })

  it('같은 달이 겹치면 연도와 달을 늘리지 않고 먼저 온 결과를 연결한다', async () => {
    const user = userEvent.setup()
    renderHistory([period('2024-03', 2), period('2024-03', 1)])

    expect(screen.getAllByRole('group')).toHaveLength(1)
    expect(screen.getAllByRole('listitem')).toHaveLength(12)
    const link = screen.getByRole('link', { name: /2024년 3월 확인 완료/ })
    expect(link).toHaveAttribute('href', '/upload/2/result')
    await user.hover(link)
    expect(screen.getByText(/2\.xlsx/)).toBeInTheDocument()
    expect(screen.queryByText(/1\.xlsx/)).not.toBeInTheDocument()
  })

  it('빈 목록은 연도나 월 칸을 그리지 않는다', () => {
    renderHistory([])

    expect(screen.queryByRole('region', { name: '업로드 내역' })).toBeNull()
    expect(screen.queryByRole('group')).toBeNull()
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})
