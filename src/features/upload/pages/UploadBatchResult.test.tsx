import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { CalculationStatus } from '../../../shared/ui/CalculationStatus/CalculationStatus'
import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { UploadResultPage } from './UploadResultPage'

function show(
  ids: number[],
  failedUploads: Array<{ name: string; reason: string }> = [],
  startedAt?: number,
) {
  const router = createMemoryRouter(
    [
      {
        path: '/upload/:uploadId/result',
        element: (
          <>
            <UploadResultPage />
            {startedAt != null && <CalculationStatus quiet />}
          </>
        ),
      },
      { path: '/upload', element: <h1>다시 올릴 파일 선택</h1> },
      { path: '/dashboard', element: <h1>테스트 대시보드</h1> },
    ],
    {
      initialEntries: [
        {
          pathname: `/upload/${ids.at(-1)}/result`,
          search: `?uploads=${ids.join(',')}`,
          state: { failedUploads, uploadStartedAt: startedAt },
        },
      ],
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
  it('처리 중인 달이 바뀌어도 알림은 첫 전송부터 경과 시간과 진행률을 표시한다', async () => {
    let firstDone = false
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json({ items: [], latestUploadId: 2 }),
      ),
      http.get('/api/uploads/:uploadId', ({ params }) =>
        HttpResponse.json(
          resultFor(
            Number(params.uploadId),
            firstDone && params.uploadId === '1' ? 'DONE' : 'PROCESSING',
          ),
        ),
      ),
    )
    show([1, 2], [], Date.now() - 4 * 60_000)
    expect(
      await screen.findByText('5분째 · 2개 중 0개 확인'),
    ).toBeInTheDocument()
    firstDone = true
    expect(
      await screen.findByText('5분째 · 2개 중 1개 확인', {}, { timeout: 5000 }),
    ).toBeInTheDocument()
  })

  it('한 파일만 올라가도 업로드 못 한 파일을 요약하고 모두 성공으로 표시하지 않는다', async () => {
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json({ items: [], latestUploadId: 1 }),
      ),
      http.get('/api/uploads/:uploadId', () =>
        HttpResponse.json(resultFor(1, 'DONE')),
      ),
    )
    show(
      [1],
      [
        {
          name: '수불부.xlsx',
          reason: '이미 올린 달이에요. 덮어쓰기를 확인해 주세요.',
        },
      ],
    )
    const failures = await screen.findByRole('region', {
      name: '업로드 못 한 파일',
    })
    expect(failures).toHaveTextContent('수불부.xlsx')
    expect(failures).toHaveTextContent('이미 올린 달이에요')
    expect(screen.queryByText('모두 확인했어요')).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '못 올린 파일 다시 고르기' }),
    ).toHaveAttribute('href', '/upload')
  })

  it.each(['DONE', 'FAILED'])(
    '모두 %s여도 완료 개수와 대시보드 이동을 보여 준다',
    async (status) => {
      server.use(
        http.get('/api/uploads/periods', () =>
          HttpResponse.json({ items: [], latestUploadId: 2 }),
        ),
        http.get('/api/uploads/:uploadId', ({ params }) =>
          HttpResponse.json(resultFor(Number(params.uploadId), status)),
        ),
      )
      show([1, 2])
      expect(
        await screen.findByRole('heading', { name: '수불부 확인을 마쳤어요' }),
      ).toBeVisible()
      expect(
        screen.getByText(
          status === 'DONE'
            ? '2개 중 2개 확인 · 0개 실패'
            : '2개 중 0개 확인 · 2개 실패',
        ),
      ).toBeVisible()
      if (status === 'DONE')
        expect(screen.getByText('모두 확인했어요')).toBeVisible()
      else expect(screen.queryByText('모두 확인했어요')).not.toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: '대시보드로 가기' }),
      ).toBeVisible()
    },
  )

  // 확인 중에는 한 파일을 올렸을 때와 같은 화면 한 장만 보인다(11/17). "대시보드로" 버튼은 2분 넘게 걸릴 때 안내 띠에 나온다(UploadProcessing.test)
  it('처리 중에는 로딩 화면 한 장만 보이고 제목·상태 줄을 따로 두지 않는다', async () => {
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json({ items: [], latestUploadId: 2 }),
      ),
      http.get('/api/uploads/:uploadId', ({ params }) =>
        HttpResponse.json(resultFor(Number(params.uploadId), 'PROCESSING')),
      ),
    )
    show([1, 2])
    await screen.findByRole('progressbar', { name: '수불부 확인 진행률' })
    expect(screen.getByText('/ 2개 확인')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '수불부 확인 중' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '대시보드로 가기' }),
    ).not.toBeInTheDocument()
  })

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
      screen
        .getAllByRole('listitem')
        .slice(0, 3)
        .every((row) => row.textContent?.includes('확인 실패')),
    ).toBe(true)
    expect(
      screen.getByRole('link', { name: '대시보드로 가기' }),
    ).toHaveAttribute('href', '/dashboard')
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
    expect(await screen.findByText('/ 2개 확인')).toBeInTheDocument()
    // 큰 숫자가 1로 바뀔 때까지 기다린다(두 파일 중 하나가 먼저 끝남)
    await waitFor(() =>
      expect(
        screen.getByRole('progressbar', { name: '수불부 확인 진행률' }),
      ).toHaveAttribute('value', '1'),
    )
    expect(
      screen.getByRole('heading', { name: '수불부를 확인하고 있어요' }),
    ).toBeVisible()
    expect(
      screen.getByRole('progressbar', { name: '수불부 확인 진행률' }),
    ).toHaveAttribute('value', '1')
    expect(
      screen.getByRole('progressbar', { name: '수불부 확인 진행률' }),
    ).toHaveAttribute('max', '2')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    complete = true
    await waitFor(
      () =>
        expect(
          screen.getByText('2개 중 1개 확인 · 1개 실패'),
        ).toBeInTheDocument(),
      { timeout: 6000 },
    )
    expect(
      screen.getByRole('heading', { name: '수불부 확인을 마쳤어요' }),
    ).toBeVisible()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
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
    expect(
      screen.queryByRole('heading', { name: '수불부 확인을 마쳤어요' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '대시보드로 가기' })).toBeVisible()
    unavailable = false
    await userEvent.click(
      screen.getByRole('button', { name: '결과 다시 확인' }),
    )
    expect(
      await screen.findByText('2개 중 2개 확인 · 0개 실패'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('list')).getAllByText('확인 완료'),
    ).toHaveLength(2)
  })
})
