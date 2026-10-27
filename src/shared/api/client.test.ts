import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../mocks/server'
import { ApiError, apiRequest } from './client'

// 서버처럼 변경 요청에는 CSRF 토큰을 헤더에 넣어야 합니다. (GET /api/auth/csrf → 토큰)
function useCsrfServer(tokens: string[]) {
  const calls = { csrf: 0, echo: 0 }

  server.use(
    http.get('/api/auth/csrf', () => {
      const token = tokens[Math.min(calls.csrf, tokens.length - 1)]
      calls.csrf += 1
      return HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token })
    }),
    http.get('/api/echo', () => HttpResponse.json({ ok: true })),
    http.post('/api/echo', ({ request }) => {
      calls.echo += 1
      const sent = request.headers.get('X-CSRF-TOKEN')
      // 마지막 토큰만 유효하다고 보고, 다른 토큰이면 403으로 거절합니다.
      return sent === tokens[tokens.length - 1]
        ? HttpResponse.json({ sent })
        : HttpResponse.json(
            { code: 'FORBIDDEN', message: 'CSRF 토큰 오류' },
            { status: 403 },
          )
    }),
  )

  return calls
}

describe('apiRequest의 CSRF 처리', () => {
  it('GET 요청은 CSRF 토큰을 받지 않는다', async () => {
    const calls = useCsrfServer(['t1'])

    await apiRequest('/echo')

    expect(calls.csrf).toBe(0)
  })

  it('POST 요청은 토큰을 받아 헤더에 넣고, 같은 토큰을 다시 받지 않고 재사용한다', async () => {
    const calls = useCsrfServer(['t1'])

    expect(await apiRequest('/echo', { method: 'POST' })).toEqual({
      sent: 't1',
    })
    expect(await apiRequest('/echo', { method: 'POST' })).toEqual({
      sent: 't1',
    })

    expect(calls.csrf).toBe(1)
  })

  it('403이면 토큰을 새로 받아 한 번만 다시 시도한다', async () => {
    const calls = useCsrfServer(['old', 'new'])

    expect(await apiRequest('/echo', { method: 'POST' })).toEqual({
      sent: 'new',
    })

    expect(calls).toEqual({ csrf: 2, echo: 2 })
  })

  it('다시 시도해도 403이면 더 반복하지 않고 오류를 던진다', async () => {
    const calls = { echo: 0 }
    server.use(
      http.get('/api/auth/csrf', () =>
        HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token: 'any' }),
      ),
      http.post('/api/echo', () => {
        calls.echo += 1
        return HttpResponse.json(
          { code: 'FORBIDDEN', message: '거절' },
          { status: 403 },
        )
      }),
    )

    await expect(apiRequest('/echo', { method: 'POST' })).rejects.toMatchObject(
      { status: 403, code: 'FORBIDDEN' },
    )
    await expect(
      apiRequest('/echo', { method: 'POST' }),
    ).rejects.toBeInstanceOf(ApiError)

    expect(calls.echo).toBe(4)
  })
})
