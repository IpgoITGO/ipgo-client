import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { UploadResultPage } from './UploadResultPage'

describe('UploadResultPage', () => {
  it('업로드 요약과 검산 제외 사유를 보여준다', async () => {
    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/upload/test/result']}>
          <Routes>
            <Route
              path="/upload/:uploadId/result"
              element={<UploadResultPage />}
            />
          </Routes>
        </MemoryRouter>
      </AppProviders>,
    )

    expect(await screen.findByText('158개 상품')).toBeInTheDocument()
    expect(screen.getByText('덴탈껌 M 5입')).toBeInTheDocument()
    expect(screen.getByText(/당일 재고와 3개 달라요/)).toBeInTheDocument()
    expect(screen.getByText(/이미 발주한 물량 1건/)).toBeInTheDocument()
  })
})
