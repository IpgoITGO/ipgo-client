import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { UploadResultPage } from './UploadResultPage'

function show(ids: number[]) {
  const router = createMemoryRouter(
    [
      { path: '/upload/:uploadId/result', element: <UploadResultPage /> },
      { path: '/upload', element: <h1>다시 올릴 파일 선택</h1> },
    ],
    {
      initialEntries: [`/upload/${ids.at(-1)}/result?uploads=${ids.join(',')}`],
    },
  )
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

const resultFor = (id: number, status: string) => ({
  uploadId: id,
  status,
  runId: null,
  periodStart: `${2025 + Math.floor((id - 1) / 12)}-${String(((id - 1) % 12) + 1).padStart(2, '0')}-01`,
  error:
    status === 'FAILED'
      ? {
          code: 'INVALID_SOURCE',
          message: `${id}월 파일의 재고를 확인해 주세요.`,
        }
      : null,
})

describe('묶음 업로드 결과', () => {
  it('마지막 파일이 성공해도 23개 중 20개 확인·3개 실패와 해당 월 재업로드를 표시한다', async () => {
    const ids = Array.from({ length: 23 }, (_, i) => i + 1)
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json({ items: [], latestUploadId: 23 }),
      ),
      http.get('/api/uploads/:uploadId', ({ params }) => {
        const id = Number(params.uploadId)
        return HttpResponse.json(
          resultFor(id, [4, 9, 11].includes(id) ? 'FAILED' : 'DONE'),
        )
      }),
    )
    const router = show(ids)
    expect(
      await screen.findByText('23개 중 20개 확인 · 3개 실패'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(23)
    expect(
      screen.getByText('4월 파일의 재고를 확인해 주세요.'),
    ).toBeInTheDocument()
    const retry = screen.getByRole('link', { name: '2025년 4월 다시 올리기' })
    await userEvent.click(retry)
    expect(router.state.location.pathname).toBe('/upload')
    expect(router.state.location.search).toBe('?retry=2025-04')
  })

  it('앞 파일이 처리 중이면 마지막 성공만으로 완료하지 않고 계속 갱신한다', async () => {
    let complete = false
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json({ items: [], latestUploadId: 2 }),
      ),
      http.get('/api/uploads/:uploadId', ({ params }) => {
        const id = Number(params.uploadId)
        return HttpResponse.json(
          resultFor(
            id,
            id === 1 && !complete ? 'PROCESSING' : id === 1 ? 'FAILED' : 'DONE',
          ),
        )
      }),
    )
    show([1, 2])
    expect(
      await screen.findByText('2개 중 1개 확인 · 0개 실패 · 1개 확인 중'),
    ).toBeInTheDocument()
    complete = true
    await waitFor(
      () =>
        expect(
          screen.getByText('2개 중 1개 확인 · 1개 실패'),
        ).toBeInTheDocument(),
      { timeout: 6000 },
    )
  })

  it('조회 실패는 정제 실패나 성공으로 세지 않고 다시 조회할 수 있다', async () => {
    let unavailable = true
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json({ items: [], latestUploadId: 2 }),
      ),
      http.get('/api/uploads/:uploadId', ({ params }) =>
        Number(params.uploadId) === 1 && unavailable
          ? HttpResponse.json(
              { code: 'UNAVAILABLE', message: '연결 실패' },
              { status: 503 },
            )
          : HttpResponse.json(resultFor(Number(params.uploadId), 'DONE')),
      ),
    )
    show([1, 2])
    expect(
      await screen.findByText('2개 중 1개 확인 · 0개 실패 · 1개 조회 실패'),
    ).toBeInTheDocument()
    unavailable = false
    await userEvent.click(
      screen.getByRole('button', { name: '결과 다시 확인' }),
    )
    expect(
      await screen.findByText('2개 중 2개 확인 · 0개 실패'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('list')).getAllByText('✅ 확인 완료'),
    ).toHaveLength(2)
  })
})
