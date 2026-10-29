import { render, screen, within } from '@testing-library/react'
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

    // 카드 제목이 곧 결론
    const calculated = await screen.findByRole('region', {
      name: '158개 상품으로 계산했어요',
    })
    expect(calculated).toHaveTextContent('자료 2026. 9. 1 ~ 2026. 10. 14')
    expect(calculated).toHaveTextContent('기준일 2026. 10. 14')

    // 뺀 상품 카드 안에 이유·고치는 방법·다시 올리기가 함께
    const excluded = screen.getByRole('region', {
      name: '1개 상품은 빼고 계산했어요',
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
