import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { PropsWithChildren } from 'react'
import { describe, expect, it } from 'vitest'

import { server } from '../../../mocks/server'
import { useBillingMutation } from './billingApi'

describe('해지 사유 요청의 재시도 키', () => {
  it('실패 뒤 같은 본문은 같은 키, 사유가 달라지면 새 키를 보낸다', async () => {
    const sent: { key: string | null; body: unknown }[] = []
    server.use(
      http.post('/api/billing/subscription/cancel', async ({ request }) => {
        sent.push({
          key: request.headers.get('Idempotency-Key'),
          body: await request.json(),
        })
        return HttpResponse.json(
          { code: 'FIXTURE_UNAVAILABLE', message: 'fixture' },
          { status: 503 },
        )
      }),
    )
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    let feedback = { reasons: ['PRICE'] }
    const { result } = renderHook(
      () => useBillingMutation('/subscription/cancel', () => feedback),
      { wrapper },
    )
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        await expect(result.current.mutateAsync(undefined)).rejects.toThrow()
      })
    }
    feedback = { reasons: ['NOT_USING'] }
    await act(async () => {
      await expect(result.current.mutateAsync(undefined)).rejects.toThrow()
    })
    expect(sent).toHaveLength(3)
    expect(sent[0].key).toBeTruthy()
    expect(sent[1].key).toBe(sent[0].key)
    expect(sent[2].key).not.toBe(sent[0].key)
    expect(sent.map((x) => x.body)).toEqual([
      { reasons: ['PRICE'] },
      { reasons: ['PRICE'] },
      { reasons: ['NOT_USING'] },
    ])
  })
})
