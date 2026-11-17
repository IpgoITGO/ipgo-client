import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { ApiError } from '../../../shared/api/client'
import { UploadPage } from './UploadPage'

// jsdom의 FormData는 Node fetch로 보낼 수 없어서 올리기 요청만 가짜로 바꾼다.
const { uploadFileMock } = vi.hoisted(() => ({ uploadFileMock: vi.fn() }))
vi.mock('../model/uploadApi', async (importActual) => ({
  ...(await importActual<typeof import('../model/uploadApi')>()),
  uploadFile: uploadFileMock,
}))

beforeEach(() => {
  uploadFileMock.mockReset()
})

function ResultLocation() {
  const location = useLocation()
  return (
    <>
      <p>결과 화면</p>
      <output aria-label="전송 실패">
        {JSON.stringify(location.state?.failedUploads ?? [])}
      </output>
      <output aria-label="결과 주소">
        {location.pathname}
        {location.search}
      </output>
    </>
  )
}

function renderPage(entry = '/upload') {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<UploadPage />} path="/upload" />
          <Route element={<ResultLocation />} path="/upload/:uploadId/result" />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
}

describe('UploadPage', () => {
  it('고른 파일과 올리기를 긴 업로드 내역보다 먼저 표시하고 선택을 비우면 숨긴다', async () => {
    const user = userEvent.setup()
    renderPage()
    const history = await screen.findByRole('heading', { name: '업로드 내역' })
    expect(
      screen.queryByRole('heading', { name: '고른 파일' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '0개 올리기' }),
    ).not.toBeInTheDocument()
    await user.upload(
      screen.getByLabelText('수불부 파일 선택'),
      new File(['ok'], '2027-03.xlsx'),
    )
    const selected = await screen.findByRole('heading', { name: '고른 파일' })
    const upload = screen.getByRole('button', { name: '1개 올리기' })
    expect(
      selected.compareDocumentPosition(history) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      upload.compareDocumentPosition(history) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '2027-03.xlsx 제거' }))
    expect(
      screen.queryByRole('heading', { name: '고른 파일' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /개 올리기/ }),
    ).not.toBeInTheDocument()
  })

  it('내역의 다시 올리기는 안내와 파일 고르기 영역으로 이동하고 같은 달을 다시 눌러도 동작한다', async () => {
    const scroll = vi.fn()
    const originalScroll = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scroll
    try {
      server.use(
        http.get('/api/uploads/periods', () =>
          HttpResponse.json({
            items: [
              {
                uploadId: 91,
                status: 'FAILED',
                period: '2026-01',
                fileName: '실패.xlsx',
                uploadedAt: '2026-11-16T00:00:00Z',
                periodStart: '2026-01-01',
                periodEnd: '2026-01-31',
                error: { code: 'INVALID_SOURCE', message: '재고 확인' },
              },
            ],
            latestUploadId: 91,
          }),
        ),
      )
      const user = userEvent.setup()
      renderPage()
      const retry = await screen.findByRole('link', {
        name: '2026년 1월 다시 올리기',
      })
      await user.click(retry)
      expect(
        screen.getByText(/2026년 1월 파일을 골라 다시 올려 주세요/),
      ).toBeVisible()
      expect(scroll).toHaveBeenCalledWith({ block: 'start' })
      expect(screen.getByRole('button', { name: '파일 고르기' })).toHaveFocus()
      const calls = scroll.mock.calls.length
      await user.click(retry)
      expect(scroll.mock.calls.length).toBeGreaterThan(calls)
      expect(screen.getByRole('button', { name: '파일 고르기' })).toHaveFocus()
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScroll
    }
  })

  it('형식이 틀린 파일은 고른 파일 목록에 넣지 않고 이유만 알려준다', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderPage()

    const input = screen.getByLabelText('수불부 파일 선택')
    await user.upload(input, [
      new File(['ok'], '2026-10.xlsx'),
      new File(['bad'], '재고현황.xls'),
    ])

    expect(
      await screen.findByRole('dialog', { name: '이 파일은 올릴 수 없어요' }),
    ).toHaveTextContent('재고현황.xls')
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(screen.getByText('올릴 수 있어요')).toBeInTheDocument()
    expect(screen.queryByText('재고현황.xls')).not.toBeInTheDocument()
    expect(screen.getByText('고른 파일 1개')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1개 올리기' })).toBeEnabled()
  })

  it('오류 파일이 여러 개면 팝업을 하나씩 차례로 보여준다', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderPage()

    await user.upload(screen.getByLabelText('수불부 파일 선택'), [
      new File(['bad'], '재고현황.xls'),
      new File(['bad'], '메모.csv'),
    ])

    const dialog = await screen.findByRole('dialog', {
      name: '이 파일은 올릴 수 없어요',
    })
    expect(dialog).toHaveTextContent('재고현황.xls')

    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(
      await screen.findByRole('dialog', { name: '이 파일은 올릴 수 없어요' }),
    ).toHaveTextContent('메모.csv')

    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('이미 올린 기간은 서버 목록과 비교해 확인 후 덮어쓸 수 있다', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.upload(
      screen.getByLabelText('수불부 파일 선택'),
      new File(['duplicate'], '2026-09.xlsx'),
    )

    expect(
      await screen.findByRole('dialog', { name: '이미 올린 기간이에요' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/2026\.10\.15 오전 10:02에 올림/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '0개 올리기' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '덮어쓰기' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('덮어쓰기 확인')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1개 올리기' })).toBeEnabled()
  })

  it('덮어쓰기를 고르면 overwrite=true로 보내고 결과 화면으로 간다', async () => {
    const user = userEvent.setup()
    uploadFileMock.mockResolvedValue({ uploadId: 15, status: 'PROCESSING' })
    renderPage()

    await user.upload(
      screen.getByLabelText('수불부 파일 선택'),
      new File(['duplicate'], '2026-09.xlsx'),
    )
    await user.click(await screen.findByRole('button', { name: '덮어쓰기' }))
    await user.click(screen.getByRole('button', { name: '1개 올리기' }))

    expect(await screen.findByText('결과 화면')).toBeInTheDocument()
    expect(uploadFileMock).toHaveBeenCalledWith(expect.any(File), true)
  })

  it('여러 파일은 한 요청에 하나씩 차례로 보낸다', async () => {
    const user = userEvent.setup()
    uploadFileMock
      .mockResolvedValueOnce({ uploadId: 21, status: 'PROCESSING' })
      .mockResolvedValueOnce({ uploadId: 22, status: 'PROCESSING' })
    renderPage()

    await user.upload(screen.getByLabelText('수불부 파일 선택'), [
      new File(['a'], '2026-10.xlsx'),
      new File(['b'], '2026-11.xlsx'),
    ])
    await user.click(await screen.findByRole('button', { name: '2개 올리기' }))

    expect(await screen.findByText('결과 화면')).toBeInTheDocument()
    expect(screen.getByLabelText('결과 주소')).toHaveTextContent(
      '/upload/22/result?uploads=21,22',
    )
    expect(uploadFileMock).toHaveBeenCalledTimes(2)
    expect(uploadFileMock.mock.calls.map(([file]) => file.name)).toEqual([
      '2026-10.xlsx',
      '2026-11.xlsx',
    ])
  })

  it('화면을 연 뒤에 올라간 기간도 고를 때 서버 목록을 다시 받아 덮어쓰기 확인을 띄운다', async () => {
    const user = userEvent.setup()
    // 처음 열 때는 빈 목록, 그 뒤(방금 올린 뒤)에는 9월이 있는 목록
    let calls = 0
    server.use(
      http.get('/api/uploads/periods', () => {
        calls += 1
        return HttpResponse.json(
          calls === 1
            ? { items: [], latestUploadId: null }
            : {
                items: [
                  {
                    period: '2026-09',
                    uploadId: 1,
                    fileName: '2026-09.xlsx',
                    periodStart: '2026-09-01',
                    periodEnd: '2026-09-30',
                    uploadedAt: '2026-11-02T16:41:32+09:00',
                    status: 'PROCESSING',
                  },
                ],
                latestUploadId: 1,
              },
        )
      }),
    )
    renderPage()
    await screen.findByText(/파일을 끌어 놓거나/)

    await user.upload(
      screen.getByLabelText('수불부 파일 선택'),
      new File(['same'], '2026-09.xlsx'),
    )

    expect(
      await screen.findByRole('dialog', { name: '이미 올린 기간이에요' }),
    ).toBeInTheDocument()
  })

  it('파일 칸을 비워 고른 목록이 사라져도 기간 목록을 기다린 뒤 고른 파일을 넣는다', async () => {
    // 크롬은 파일 칸 value를 비우면 손에 든 FileList까지 비운다. 그 동작을 흉내 낸다.
    renderPage()
    await screen.findByText(/파일을 끌어 놓거나/)
    const input = screen.getByLabelText('수불부 파일 선택') as HTMLInputElement
    const list = [new File(['ok'], '2026-10.xlsx')]
    Object.defineProperty(input, 'files', {
      configurable: true,
      get: () => list,
    })
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => '',
      set: () => {
        list.length = 0
      },
    })

    fireEvent.change(input)

    expect(await screen.findByText('고른 파일 1개')).toBeInTheDocument()
  })

  it('이름에 달이 없어도 서버가 정한 기간으로 확인하고 덮어쓴다', async () => {
    const user = userEvent.setup()
    uploadFileMock
      .mockRejectedValueOnce(
        new ApiError(409, 'UPLOAD_DUPLICATE', '이미 올린 기간입니다.', {
          reason: 'SAME_PERIOD',
          existing: {
            originalName: '기존수불부.xlsx',
            periodStart: '2026-09-01',
            periodEnd: '2026-09-30',
            uploadedAt: '2026-10-15T10:02:00+09:00',
          },
        }),
      )
      .mockResolvedValueOnce({ uploadId: 22, status: 'PROCESSING' })
    renderPage()
    await user.upload(
      screen.getByLabelText('수불부 파일 선택'),
      new File(['same'], '수불부.xlsx'),
    )
    await user.click(await screen.findByRole('button', { name: '1개 올리기' }))
    const modal = await screen.findByRole('dialog', {
      name: '이미 올린 기간이에요',
    })
    expect(modal).toHaveTextContent('입고일자로 보면 2026년 9월이에요')
    expect(modal).toHaveTextContent('기존수불부.xlsx')
    expect(screen.queryByText('이미 올린 기간입니다.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '덮어쓰기' }))
    await user.click(screen.getByRole('button', { name: '1개 올리기' }))
    expect(await screen.findByText('결과 화면')).toBeInTheDocument()
    expect(uploadFileMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: '수불부.xlsx' }),
      true,
    )
    expect(screen.getByLabelText('전송 실패')).toHaveTextContent('[]')
  })

  it('중간 중복 뒤 정상 파일도 보내고 취소한 파일은 완료 요약에 전달한다', async () => {
    const user = userEvent.setup()
    uploadFileMock
      .mockResolvedValueOnce({ uploadId: 21, status: 'PROCESSING' })
      .mockRejectedValueOnce(
        new ApiError(409, 'UPLOAD_DUPLICATE', '이미 올린 기간입니다.', {
          reason: 'SAME_PERIOD',
          existing: {
            periodStart: '2026-09-01',
            originalName: '기존.xlsx',
            uploadedAt: '2026-10-15T10:02:00+09:00',
          },
        }),
      )
      .mockResolvedValueOnce({ uploadId: 22, status: 'PROCESSING' })
    renderPage()
    await user.upload(screen.getByLabelText('수불부 파일 선택'), [
      new File(['a'], '2026-10.xlsx'),
      new File(['b'], '수불부.xlsx'),
      new File(['c'], '2026-11.xlsx'),
    ])
    await user.click(await screen.findByRole('button', { name: '3개 올리기' }))
    await screen.findByRole('dialog', { name: '이미 올린 기간이에요' })
    expect(uploadFileMock).toHaveBeenCalledTimes(3)
    await user.click(
      within(
        screen.getByRole('dialog', { name: '이미 올린 기간이에요' }),
      ).getByRole('button', { name: '취소' }),
    )
    expect(await screen.findByText('결과 화면')).toBeInTheDocument()
    expect(screen.getByLabelText('결과 주소')).toHaveTextContent(
      '/upload/22/result?uploads=21,22',
    )
    expect(screen.getByLabelText('전송 실패')).toHaveTextContent('수불부.xlsx')
  })

  it('서버가 같은 기간이라고 거절하면 덮어쓰기 확인을 띄운다', async () => {
    const user = userEvent.setup()
    uploadFileMock.mockImplementation(async () => {
      throw new ApiError(409, 'UPLOAD_DUPLICATE', '이미 올린 기간입니다')
    })
    renderPage()

    // 목록에는 없지만 서버에서는 이미 올린 기간인 경우를 흉내 낸다.
    server.use(
      http.get('/api/uploads/periods', () =>
        HttpResponse.json({ items: [], latestUploadId: null }),
      ),
    )
    await user.upload(
      screen.getByLabelText('수불부 파일 선택'),
      new File(['duplicate'], '2026-09.xlsx'),
    )
    expect(await screen.findByText('올릴 수 있어요')).toBeInTheDocument()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: '1개 올리기' }))

    expect(
      await screen.findByRole('dialog', { name: '이미 올린 기간이에요' }),
    ).toBeInTheDocument()
  })

  it.each([
    [400, 'UPLOAD_INVALID_FORMAT', '필수 열(입고)이 없습니다.'],
    [413, 'FILE_TOO_LARGE', '파일 크기 제한을 초과했습니다.'],
  ])(
    '서버가 %s(%s)로 거절해도 나머지를 보내고 실패 파일은 요약에 전달한다',
    async (status, code, message) => {
      const user = userEvent.setup()
      uploadFileMock.mockImplementation(async (file: File) => {
        if (file.name === '2026-10.xlsx')
          throw new ApiError(status, code, message)
        return { uploadId: 15, status: 'PROCESSING' }
      })
      renderPage()

      await user.upload(screen.getByLabelText('수불부 파일 선택'), [
        new File(['bad'], '2026-10.xlsx'),
        new File(['ok'], '2026-11.xlsx'),
      ])
      await user.click(
        await screen.findByRole('button', { name: '2개 올리기' }),
      )

      const dialog = await screen.findByRole('dialog', {
        name: '이 파일은 올릴 수 없어요',
      })
      expect(dialog).toHaveTextContent('2026-10.xlsx')
      expect(dialog).toHaveTextContent(message)
      await user.click(screen.getByRole('button', { name: '확인' }))

      expect(screen.queryByText('2026-10.xlsx')).not.toBeInTheDocument()
      expect(await screen.findByText('결과 화면')).toBeInTheDocument()
      expect(uploadFileMock).toHaveBeenCalledTimes(2)
      expect(screen.getByLabelText('전송 실패')).toHaveTextContent(
        '2026-10.xlsx',
      )
    },
  )

  // 덮어쓰기로 보내도 서버는 SAME_FILE이면 계속 409를 준다(#105).
  it.each([
    ['새 파일', '2026-10.xlsx', false],
    ['덮어쓰기로 고른 파일', '2026-09.xlsx', true],
  ])(
    '%s이 같은 내용의 다른 기간 파일이면 덮어쓰기 없이 "이미 올린 파일" 안내를 띄운다',
    async (_, name, chooseOverwrite) => {
      const user = userEvent.setup()
      uploadFileMock.mockImplementation(async () => {
        throw new ApiError(409, 'UPLOAD_DUPLICATE', '이미 올린 파일입니다.', {
          reason: 'SAME_FILE',
          existing: {
            originalName: '2026-08.xlsx',
            uploadedAt: '2026-10-15T10:02:00+09:00',
          },
        })
      })
      renderPage()

      await user.upload(
        screen.getByLabelText('수불부 파일 선택'),
        new File(['same'], name),
      )
      if (chooseOverwrite) {
        await user.click(
          await screen.findByRole('button', { name: '덮어쓰기' }),
        )
      }
      await user.click(
        await screen.findByRole('button', { name: '1개 올리기' }),
      )

      const dialog = await screen.findByRole('dialog', {
        name: '이미 올린 파일이에요',
      })
      expect(dialog).toHaveTextContent(
        '2026-08.xlsx 이름으로 2026.10.15 오전 10:02에 올림',
      )
      expect(
        screen.queryByRole('button', { name: '덮어쓰기' }),
      ).not.toBeInTheDocument()
      expect(screen.getByText('이미 올린 파일')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '0개 올리기' })).toBeDisabled()

      await user.click(screen.getByRole('button', { name: '목록에서 빼기' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: `${name} 제거` }),
      ).not.toBeInTheDocument()
    },
  )
})

it('긴 파일명의 연월도 기존 업로드와 비교한다', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.upload(
    screen.getByLabelText('수불부 파일 선택'),
    new File(['x'], '2026-09_수불부.xlsx'),
  )
  expect(
    await screen.findByRole('dialog', { name: '이미 올린 기간이에요' }),
  ).toHaveTextContent('2026년 9월')
})
it('고른 파일끼리 같은 달이면 두 번째 파일은 올리지 않는다', async () => {
  const user = userEvent.setup()
  renderPage()
  await user.upload(screen.getByLabelText('수불부 파일 선택'), [
    new File(['x'], '202604_수불부.xlsx'),
    new File(['y'], '2026년 4월.xlsx'),
  ])
  expect(
    await screen.findByRole('dialog', { name: '이 파일은 올릴 수 없어요' }),
  ).toHaveTextContent('같은 달은 한 개씩')
  await user.click(screen.getByRole('button', { name: '확인' }))
  expect(screen.getByRole('button', { name: '1개 올리기' })).toBeEnabled()
})

it('중간 전송 실패 후 남은 파일만 올려도 앞서 올린 파일을 묶음 결과에 포함한다', async () => {
  const user = userEvent.setup()
  uploadFileMock
    .mockResolvedValueOnce({ uploadId: 21, status: 'PROCESSING' })
    .mockRejectedValueOnce(new Error('연결 실패'))
    .mockResolvedValueOnce({ uploadId: 22, status: 'PROCESSING' })
  renderPage()
  await user.upload(screen.getByLabelText('수불부 파일 선택'), [
    new File(['a'], '2026-10.xlsx'),
    new File(['b'], '2026-11.xlsx'),
  ])
  await user.click(await screen.findByRole('button', { name: '2개 올리기' }))
  expect(
    await screen.findByRole('link', { name: '올린 파일 결과 보기' }),
  ).toHaveAttribute('href', '/upload/21/result?uploads=21')
  await user.click(screen.getByRole('button', { name: '1개 올리기' }))
  expect(await screen.findByText('결과 화면')).toBeInTheDocument()
  expect(screen.getByLabelText('결과 주소')).toHaveTextContent(
    '/upload/22/result?uploads=21,22',
  )
  expect(uploadFileMock.mock.calls.map(([file]) => file.name)).toEqual([
    '2026-10.xlsx',
    '2026-11.xlsx',
    '2026-11.xlsx',
  ])
})
