import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '../../mocks/server'

afterEach(() => vi.unstubAllGlobals())

describe('같은 쿠키를 쓰는 탭의 갱신 순서', () => {
  it('서로 다른 모듈의 갱신을 같은 브라우저 잠금으로 직렬화한다', async () => {
    let tail: Promise<unknown> = Promise.resolve()
    const request = vi.fn((_name: string, callback: () => Promise<void>) => {
      const next = tail.then(callback)
      tail = next.catch(() => {})
      return next
    })
    vi.stubGlobal('navigator', { locks: { request } })
    vi.resetModules()
    const first = await import('./client')
    vi.resetModules()
    const second = await import('./client')
    let generation = 0
    let inFlight = 0
    let peak = 0
    server.use(
      http.get('/api/auth/csrf', () =>
        HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }),
      ),
      http.post('/api/auth/refresh', async () => {
        const observed = generation
        peak = Math.max(peak, ++inFlight)
        await delay(30)
        inFlight--
        if (observed !== generation)
          return HttpResponse.json(
            { code: 'INVALID_REFRESH_TOKEN' },
            { status: 401 },
          )
        return HttpResponse.json({ accessToken: `tab-${++generation}` })
      }),
    )
    await expect(
      Promise.all([first.refreshAccessToken(), second.refreshAccessToken()]),
    ).resolves.toEqual([undefined, undefined])
    expect(peak).toBe(1)
    expect(generation).toBe(2)
    expect(request.mock.calls.map(([name]) => name)).toEqual([
      'ipgo:auth-refresh',
      'ipgo:auth-refresh',
    ])
    expect(first.hasAccessToken()).toBe(true)
    expect(second.hasAccessToken()).toBe(true)
  })

  it('Web Locks가 없는 환경에서도 같은 탭의 동시 갱신은 한 번만 전송한다', async () => {
    vi.stubGlobal('navigator', {})
    vi.resetModules()
    const client = await import('./client')
    const refresh = vi.fn(() => HttpResponse.json({ accessToken: 'fresh' }))
    server.use(
      http.get('/api/auth/csrf', () =>
        HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }),
      ),
      http.post('/api/auth/refresh', refresh),
    )
    await Promise.all([
      client.refreshAccessToken(),
      client.refreshAccessToken(),
    ])
    expect(refresh).toHaveBeenCalledOnce()
  })
})
