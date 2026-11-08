import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { delay, http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import {
  AuthContext,
  type AuthContextValue,
} from '../../../auth/model/authContext'
import { server } from '../../../mocks/server'
import { usePlannedMutation, usePlannedQuery } from './plannedQuantity'

function View() {
  const query = usePlannedQuery()
  const save = usePlannedMutation('7', 101)
  return (
    <>
      <span>{query.data?.['7']?.quantity ?? '비어 있음'}</span>
      <button onClick={() => save.mutate({ quantity: 20, source: 'MANUAL' })}>
        저장
      </button>
    </>
  )
}
function tree(client: QueryClient, email: string) {
  const auth: AuthContextValue = {
    status: 'authenticated',
    user: { email, name: '합성', companyName: '시험' },
    sessionExpired: false,
    signIn: async () => {},
    signOut: async () => {},
    signOutLocally: () => {},
  }
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <View />
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}
it('다른 계정으로 바뀐 뒤 늦게 도착한 이전 조회가 새 계정에 섞이지 않는다', async () => {
  let reads = 0
  server.use(
    http.get('/api/planned-quantities', async () => {
      const first = ++reads === 1
      if (first) await delay(120)
      return HttpResponse.json({
        items: [
          {
            productId: 7,
            quantity: first ? 11 : 77,
            source: 'MANUAL',
            calculationRunId: 31,
            decidedAt: '2026-11-05',
          },
        ],
      })
    }),
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(tree(client, 'first@example.test'))
  await waitFor(() => expect(reads).toBe(1))
  view.rerender(tree(client, 'second@example.test'))
  expect(await screen.findByText('77')).toBeInTheDocument()
  await act(async () => {
    await delay(150)
  })
  expect(screen.queryByText('11')).not.toBeInTheDocument()
  expect(screen.getByText('77')).toBeInTheDocument()
})
it('저장 중 계정이 바뀌어도 이전 응답은 이전 계정 캐시에만 반영한다', async () => {
  let writes = 0
  server.use(
    http.get('/api/planned-quantities', () => HttpResponse.json({ items: [] })),
    http.get('/api/dashboard/replenishment-needs', () =>
      HttpResponse.json({
        runId: 31,
        asOfDate: '2026-11-05',
        items: [{ productId: 7, resultId: 101 }],
      }),
    ),
    http.get('/api/products/7/detail', () =>
      HttpResponse.json({
        asOfDate: '2026-11-05',
        result: { resultId: 101, status: 'OK' },
      }),
    ),
    http.put('/api/products/7/planned-quantity', async () => {
      writes++
      await delay(100)
      return HttpResponse.json({
        productId: 7,
        quantity: 20,
        source: 'MANUAL',
        calculationRunId: 31,
        decidedAt: '2026-11-05',
      })
    }),
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(tree(client, 'first@example.test'))
  await screen.findByText('비어 있음')
  fireEvent.click(screen.getByRole('button', { name: '저장' }))
  await waitFor(() => expect(writes).toBe(1))
  view.rerender(tree(client, 'second@example.test'))
  await waitFor(() =>
    expect(
      client.getQueryData<Record<string, { quantity: number }>>([
        'planned-quantities',
        'first@example.test',
      ])?.['7']?.quantity,
    ).toBe(20),
  )
  expect(
    client.getQueryData(['planned-quantities', 'second@example.test']),
  ).toEqual({})
  expect(screen.queryByText('20')).not.toBeInTheDocument()
})
