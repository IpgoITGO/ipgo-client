import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { UploadPage } from './UploadPage'

describe('UploadPage', () => {
  it('파일별 검증 결과를 보여주고 오류 파일을 제외한다', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    )

    const input = screen.getByLabelText('수불부 파일 선택')
    await user.upload(input, [
      new File(['ok'], '2026-10.xlsx'),
      new File(['bad'], '재고현황.xlsx'),
    ])

    expect(screen.getByText('올릴 수 있어요')).toBeInTheDocument()
    expect(screen.getByText('형식 오류')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1개 올리기' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '재고현황.xlsx 제거' }))
    expect(screen.queryByText('재고현황.xlsx')).not.toBeInTheDocument()
  })

  it('기존 기간은 확인 후 덮어쓸 수 있다', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>,
    )

    await user.upload(
      screen.getByLabelText('수불부 파일 선택'),
      new File(['duplicate'], '2026-09.xlsx'),
    )

    expect(
      screen.getByRole('dialog', { name: '이미 올린 기간이에요' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '0개 올리기' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '덮어쓰기' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('덮어쓰기 확인')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1개 올리기' })).toBeEnabled()
  })
})
