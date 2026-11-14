import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

function renderPage() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={['/upload']}>
        <Routes>
          <Route element={<UploadPage />} path="/upload" />
          <Route element={<p>결과 화면</p>} path="/upload/:uploadId/result" />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
}

describe('UploadPage', () => {
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
    '서버가 %s(%s)로 거절하면 그 파일에 이유를 붙여 보여 주고 나머지는 남긴다',
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
      expect(screen.getByRole('button', { name: '1개 올리기' })).toBeEnabled()
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
      expect(screen.queryByText(name)).not.toBeInTheDocument()
    },
  )
})
