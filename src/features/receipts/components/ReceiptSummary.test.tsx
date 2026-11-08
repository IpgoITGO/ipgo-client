import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import {
  AuthContext,
  type AuthContextValue,
} from '../../../auth/model/authContext'
import { server } from '../../../mocks/server'
import { ReceiptCorrectionsLink } from '../pages/ReceiptCorrectionsPage'
it('캐시의0건이 있어도 최신 조회 실패를 정상0건으로 표시하지 않는다', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(
    ['receipt-corrections', 'owner@example.test', 'summary', '/'],
    { items: [], nextCursor: null },
  )
  server.use(
    http.get('/api/receipt-corrections', () =>
      HttpResponse.json({ message: '조회 실패' }, { status: 500 }),
    ),
  )
  const auth: AuthContextValue = {
    status: 'authenticated',
    user: { email: 'owner@example.test', name: '합성', companyName: '시험' },
    sessionExpired: false,
    signIn: async () => {},
    signOut: async () => {},
    signOutLocally: () => {},
  }
  render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <ReceiptCorrectionsLink />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  expect(
    await screen.findByRole('link', { name: /입고 확인 \(조회 필요\)/ }),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: '입고 확인 (0건)' }),
  ).not.toBeInTheDocument()
})
