import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { UploadResultPage } from './UploadResultPage'

function renderPage() {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={['/upload/15/result']}>
        <Routes>
          <Route
            path="/upload/:uploadId/result"
            element={<UploadResultPage />}
          />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
}

describe('UploadResultPage', () => {
  it('업로드 요약과 검산 제외 사유를 보여준다', async () => {
    renderPage()

    expect(await screen.findByText('158개 상품')).toBeInTheDocument()
    expect(screen.getByText('2026. 9. 1 ~ 2026. 10. 14')).toBeInTheDocument()
    expect(screen.getByText('2026. 10. 14')).toBeInTheDocument()
    expect(screen.getByText('덴탈껌 M 5입')).toBeInTheDocument()
    expect(screen.getByText(/당일 재고와 3개 달라요/)).toBeInTheDocument()
    expect(screen.getByText(/이미 발주한 물량 1건/)).toBeInTheDocument()
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
})
