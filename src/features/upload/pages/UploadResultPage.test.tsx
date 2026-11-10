import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { UploadResultPage } from './UploadResultPage'

function renderPage() {
  // 처리 중 나가기 확인(useBlocker)이 있어서 데이터 라우터로 그린다.
  const router = createMemoryRouter(
    [
      { path: '/upload/:uploadId/result', element: <UploadResultPage /> },
      { path: '/dashboard', element: <h1>테스트 대시보드</h1> },
    ],
    { initialEntries: ['/upload/15/result'] },
  )
  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

describe('UploadResultPage', () => {
  it('입력 오류의 구체적 이유를 텍스트로 보여주고 재업로드를 안내한다', async () => {
    const reason =
      '전월 잔여 재고의 재고관리단위가 이번 자료에 없어요(3개). 같은 셀러·창고인지 확인해 주세요.'
    server.use(
      http.get('/api/uploads/:uploadId', () =>
        HttpResponse.json({
          uploadId: 15,
          status: 'FAILED',
          error: {
            code: 'INVALID_SOURCE',
            message: '기존 안내',
            reason,
            details: { reason: 'PREVIOUS_MONTH_MISMATCH' },
          },
        }),
      ),
    )
    renderPage()
    expect(await screen.findByText(reason)).toBeVisible()
    expect(screen.getByRole('button', { name: '다시 올리기' })).toBeVisible()
    expect(screen.queryByText('기존 안내')).not.toBeInTheDocument()
  })

  it('서버 장애는 내부 이유를 표시하지 않고 같은 파일 재시도를 안내한다', async () => {
    server.use(
      http.get('/api/uploads/:uploadId', () =>
        HttpResponse.json({
          uploadId: 15,
          status: 'FAILED',
          error: {
            code: 'ENGINE_UNAVAILABLE',
            message: '고정 안내',
            reason: '내부 장애 문자열',
          },
        }),
      ),
    )
    renderPage()
    expect(
      await screen.findByText(
        '파일 문제는 아니에요. 잠시 뒤 같은 파일을 그대로 다시 올려 주세요.',
      ),
    ).toBeVisible()
    expect(screen.queryByText('내부 장애 문자열')).not.toBeInTheDocument()
  })

  it('업로드 요약과 검산 제외 사유를 보여준다', async () => {
    renderPage()

    // 카드 제목이 곧 결론
    const calculated = await screen.findByRole('region', {
      name: '이번 파일의 158개 상품이 검산을 통과했어요',
    })
    expect(calculated).toHaveTextContent('자료 2026. 9. 1 ~ 2026. 10. 14')
    expect(calculated).toHaveTextContent('기준일 2026. 10. 14')

    // 뺀 상품 카드 안에 이유·고치는 방법·다시 올리기가 함께
    const excluded = screen.getByRole('region', {
      name: '이번 파일에서 1개 상품을 제외했어요',
    })
    expect(excluded).toHaveTextContent('덴탈껌 M 5입')
    expect(excluded).toHaveTextContent('재고 안 맞음')
    expect(excluded).toHaveTextContent('재고 숫자가 3개 안 맞아요')
    expect(excluded).toHaveTextContent('수불부 9월 12일 행의')
    expect(
      within(excluded).getByRole('button', { name: '고친 파일 다시 올리기 →' }),
    ).toBeInTheDocument()

    // 발주 확인은 따로
    expect(screen.getByText('따로 알려드려요')).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: /이미 발주한 물량 1건/ }),
    ).not.toHaveTextContent('재고 안 맞음')
  })

  it('처리 중이던 화면이 끝나면 끝난 순간 연출을 보여준 뒤 결과를 보여준다', async () => {
    server.use(
      http.get(
        '/api/uploads/:uploadId',
        () => HttpResponse.json({ uploadId: 15, status: 'PROCESSING' }),
        { once: true },
      ),
    )
    renderPage()

    expect(
      await screen.findByText('수불부를 확인하고 있어요'),
    ).toBeInTheDocument()
    // 2초 뒤 다시 확인해 끝난 걸 알면 연출이 먼저 나온다
    expect(
      await screen.findByText('수불부 확인을 마쳤어요', {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    // 1.5초 뒤 결과로 넘어간다
    expect(
      await screen.findByRole(
        'region',
        { name: '이번 파일의 158개 상품이 검산을 통과했어요' },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument()
  }, 10_000)

  it('이미 끝난 기록을 열면 연출 없이 바로 결과를 보여준다', async () => {
    renderPage()

    expect(
      await screen.findByRole('region', {
        name: '이번 파일의 158개 상품이 검산을 통과했어요',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('수불부 확인을 마쳤어요')).not.toBeInTheDocument()
  })

  it('처리에 실패하면 다시 올리기 안내를 보여준다', async () => {
    server.use(
      http.get('/api/uploads/:uploadId', () =>
        HttpResponse.json({ uploadId: 15, status: 'FAILED' }),
      ),
    )
    renderPage()

    expect(
      await screen.findByText('수불부를 처리하지 못했어요'),
    ).toBeInTheDocument()
  })

  it('마감한 과거 기록은 재업로드 없이 보존 안내를 보여주고 대시보드로 이동한다', async () => {
    server.use(
      http.get('/api/uploads/:uploadId', () =>
        HttpResponse.json({
          uploadId: 15,
          status: 'FAILED',
          error: {
            code: 'LEGACY_UPLOAD_CLOSED',
            message: '과거 미처리 기록을 재처리 없이 마감했습니다.',
          },
        }),
      ),
    )
    const user = userEvent.setup()
    renderPage()

    expect(
      await screen.findByRole('heading', {
        name: '과거 업로드 기록을 마감했어요',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/원본과 이력은 보존했으며/)).toHaveTextContent(
      '이 기록은 다시 처리하지 않습니다.',
    )
    expect(
      screen.queryByRole('button', { name: /다시 올리기/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('수불부 확인을 마쳤어요')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '대시보드로' }))

    expect(
      await screen.findByRole('heading', { name: '테스트 대시보드' }),
    ).toBeInTheDocument()
  })

  it('처리 중 보던 과거 기록이 마감되면 성공 연출 없이 마감 안내로 바뀐다', async () => {
    server.use(
      http.get(
        '/api/uploads/:uploadId',
        () => HttpResponse.json({ uploadId: 15, status: 'PROCESSING' }),
        { once: true },
      ),
      http.get('/api/uploads/:uploadId', () =>
        HttpResponse.json({
          uploadId: 15,
          status: 'FAILED',
          error: {
            code: 'LEGACY_UPLOAD_CLOSED',
            message: '과거 미처리 기록을 재처리 없이 마감했습니다.',
          },
        }),
      ),
    )
    renderPage()

    expect(
      await screen.findByText('수불부를 확인하고 있어요'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(
        '과거 업로드 기록을 마감했어요',
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('수불부 확인을 마쳤어요')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /다시 올리기/ }),
    ).not.toBeInTheDocument()
  })

  it('서버 쪽 실패면 파일을 고치라고 하지 않고 같은 파일을 다시 올리게 한다', async () => {
    server.use(
      http.get('/api/uploads/:uploadId', () =>
        HttpResponse.json({
          uploadId: 15,
          status: 'FAILED',
          error: {
            code: 'ENGINE_UNAVAILABLE',
            message: '정제 서비스를 사용할 수 없습니다.',
          },
        }),
      ),
    )
    renderPage()

    expect(
      await screen.findByText('서버에서 수불부를 처리하지 못했어요'),
    ).toBeInTheDocument()
    expect(screen.getByText(/파일 문제는 아니에요/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '같은 파일 다시 올리기' }),
    ).toBeInTheDocument()
  })

  it('없거나 남의 업로드 기록이면 다시 시도 대신 업로드 화면으로 보낸다', async () => {
    server.use(
      http.get('/api/uploads/:uploadId', () =>
        HttpResponse.json(
          { code: 'NOT_FOUND', message: '업로드 기록을 찾을 수 없습니다.' },
          { status: 404 },
        ),
      ),
    )
    renderPage()

    expect(
      await screen.findByText('이 업로드 결과를 찾을 수 없어요'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '업로드 화면으로' }),
    ).toBeInTheDocument()
  })
})
