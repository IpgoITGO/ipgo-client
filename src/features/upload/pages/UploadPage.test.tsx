import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { ApiError } from '../../../shared/api/client'
import { UploadPage } from './UploadPage'

// jsdom의 FormData는 Node fetch로 보낼 수 없어서 올리기 요청만 가짜로 바꾼다.
const { uploadFilesMock } = vi.hoisted(() => ({ uploadFilesMock: vi.fn() }))
vi.mock('../model/uploadApi', async (importActual) => ({
  ...(await importActual<typeof import('../model/uploadApi')>()),
  uploadFiles: uploadFilesMock,
}))

beforeEach(() => {
  uploadFilesMock.mockReset()
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
  it('파일별 검증 결과를 보여주고 오류 파일을 제외한다', async () => {
    const user = userEvent.setup()
    renderPage()

    const input = screen.getByLabelText('수불부 파일 선택')
    await user.upload(input, [
      new File(['ok'], '2026-10.xlsx'),
      new File(['bad'], '재고현황.xlsx'),
    ])

    expect(await screen.findByText('올릴 수 있어요')).toBeInTheDocument()
    expect(screen.getByText('형식 오류')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1개 올리기' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '재고현황.xlsx 제거' }))
    expect(screen.queryByText('재고현황.xlsx')).not.toBeInTheDocument()
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
    uploadFilesMock.mockResolvedValue({ uploadId: 15, status: 'PROCESSING' })
    renderPage()

    await user.upload(
      screen.getByLabelText('수불부 파일 선택'),
      new File(['duplicate'], '2026-09.xlsx'),
    )
    await user.click(await screen.findByRole('button', { name: '덮어쓰기' }))
    await user.click(screen.getByRole('button', { name: '1개 올리기' }))

    expect(await screen.findByText('결과 화면')).toBeInTheDocument()
    expect(uploadFilesMock).toHaveBeenCalledWith(expect.any(Array), true)
  })

  it('서버가 같은 기간이라고 거절하면 덮어쓰기 확인을 띄운다', async () => {
    const user = userEvent.setup()
    uploadFilesMock.mockImplementation(async () => {
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
})
