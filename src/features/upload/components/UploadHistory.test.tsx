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
    expect(screen.getByText('확인 완료')).toBeInTheDocument()
    expect(screen.getByText('확인 중')).toBeInTheDocument()
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
    expect(await screen.findByText('과거 기록 마감')).toBeInTheDocument()
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
