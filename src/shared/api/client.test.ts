import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '../../mocks/server'
import {
  ApiError,
  apiRequest,
  AUTH_EXPIRED_EVENT,
  CONNECTION_FAILED,
  hasAccessToken,
  setAccessToken,
  setApiRequestReadinessCheck,
} from './client'

describe('API 요청 본문의 Content-Type', () => {
  function echoHeaders() {
    server.use(
      http.get('/api/auth/csrf', () =>
        HttpResponse.json({
          headerName: 'X-CSRF-TOKEN',
          token: 'content-type',
        }),
      ),
      http.post('/api/content-type', async ({ request }) =>
        HttpResponse.json({
          contentType: request.headers.get('Content-Type'),
          custom: request.headers.get('X-Custom'),
          body: await request.text(),
        }),
      ),
    )
  }

  it.each([
    undefined,
    { 'X-Custom': 'kept' },
    new Headers({ 'X-Custom': 'kept' }),
    [['X-Custom', 'kept']] as [string, string][],
  ])(
    '헤더 형식과 관계없이 JSON 문자열에 기본 형식을 붙인다: %j',
    async (headers) => {
      server.use(
        http.get('/api/auth/csrf', () =>
          HttpResponse.json({
            headerName: 'X-CSRF-TOKEN',
            token: 'content-type',
          }),
        ),
        http.put('/api/content-type', async ({ request }) => {
          if (request.headers.get('Content-Type') !== 'application/json') {
            return HttpResponse.json(
              { code: 'UNSUPPORTED_MEDIA_TYPE' },
              { status: 415 },
            )
          }
          return HttpResponse.json({
            body: await request.json(),
            custom: request.headers.get('X-Custom'),
            csrf: request.headers.get('X-CSRF-TOKEN'),
            accept: request.headers.get('Accept'),
          })
        }),
      )
      await expect(
        apiRequest('/content-type', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ratePerCbm: 1200 }),
        }),
      ).resolves.toEqual({
        body: { ratePerCbm: 1200 },
        custom: headers ? 'kept' : null,
        csrf: 'content-type',
        accept: 'application/json',
      })
    },
  )

  it.each([
    { 'content-type': 'application/x-www-form-urlencoded' },
    new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    [['CONTENT-TYPE', 'application/x-www-form-urlencoded']] as [
      string,
      string,
    ][],
  ])(
    '명시한 형식은 대소문자나 헤더 형식과 관계없이 보존한다: %j',
    async (headers) => {
      echoHeaders()
      await expect(
        apiRequest('/content-type', {
          method: 'POST',
          headers,
          body: 'username=seller',
        }),
      ).resolves.toMatchObject({
        contentType: 'application/x-www-form-urlencoded',
        body: 'username=seller',
      })
    },
  )

  it('본문이 없으면 Content-Type을 추가하지 않는다', async () => {
    echoHeaders()
    await expect(
      apiRequest('/content-type', { method: 'POST' }),
    ).resolves.toMatchObject({ contentType: null, body: '' })
  })

  it('FormData의 multipart 경계는 브라우저가 생성하게 둔다', async () => {
    echoHeaders()
    const body = new FormData()
    body.append('file', 'sample')
    const result = await apiRequest<{ contentType: string; body: string }>(
      '/content-type',
      {
        method: 'POST',
        body,
      },
    )
    expect(result.contentType).toMatch(/^multipart\/form-data; boundary=/)
    expect(result.body).toContain('sample')
  })

  it('URLSearchParams와 Blob의 형식을 JSON으로 바꾸지 않는다', async () => {
    echoHeaders()
    await expect(
      apiRequest('/content-type', {
        method: 'POST',
        body: new URLSearchParams({ key: 'value' }),
      }),
    ).resolves.toMatchObject({
      contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
      body: 'key=value',
    })
    await expect(
      apiRequest('/content-type', {
        method: 'POST',
        body: new Blob(['sample'], { type: 'application/pdf' }),
      }),
    ).resolves.toMatchObject({ contentType: 'application/pdf', body: 'sample' })
  })
})

describe('API 전송 전 모의 서버 준비 검사', () => {
  let removeCheck = () => {}
  afterEach(() => removeCheck())

  it('준비가 끝나기 전에는 CSRF와 변경 요청을 보내지 않고, 완료 뒤 한 번만 전송한다', async () => {
    const calls = useCsrfServer(['t1'])
    let ready!: () => void
    const preparation = new Promise<void>((resolve) => {
      ready = resolve
    })
    removeCheck = setApiRequestReadinessCheck(() => preparation)
    const response = apiRequest('/echo', { method: 'POST' })
    await Promise.resolve()
    expect(calls).toEqual({ csrf: 0, echo: 0 })
    ready()
    await expect(response).resolves.toEqual({ sent: 't1' })
    expect(calls).toEqual({ csrf: 1, echo: 1 })
  })

  it('준비 실패는 연결 오류로 안내하며 HTTP 요청이나 자동 재전송을 하지 않는다', async () => {
    const calls = useCsrfServer(['t1'])
    const check = vi.fn().mockRejectedValue(new Error('준비 시간 초과'))
    removeCheck = setApiRequestReadinessCheck(check)
    await expect(apiRequest('/echo', { method: 'POST' })).rejects.toMatchObject(
      { code: CONNECTION_FAILED },
    )
    expect(calls).toEqual({ csrf: 0, echo: 0 })
    expect(check).toHaveBeenCalledOnce()
  })

  it('검사가 해제되면 실제 API 경로의 동작을 바꾸지 않는다', async () => {
    const calls = useCsrfServer(['t1'])
    const check = vi.fn().mockRejectedValue(new Error('모의 서버'))
    removeCheck = setApiRequestReadinessCheck(check)
    removeCheck()
    await expect(apiRequest('/echo', { method: 'POST' })).resolves.toEqual({
      sent: 't1',
    })
    expect(check).not.toHaveBeenCalled()
    expect(calls).toEqual({ csrf: 1, echo: 1 })
  })
})

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

describe('apiRequest의 연결 문제 구분', () => {
  it('성공(200)인데 JSON이 아닌 응답은 연결 문제로 던진다', async () => {
    server.use(http.get('/api/page', () => HttpResponse.html('<html></html>')))

    await expect(apiRequest('/page')).rejects.toMatchObject({
      code: 'CONNECTION_FAILED',
    })
  })

  it('JSON이 아닌 404는 연결 문제로, JSON 오류 본문은 그대로 던진다', async () => {
    server.use(
      http.get(
        '/api/missing',
        () => new HttpResponse('not found', { status: 404 }),
      ),
      http.get('/api/known', () =>
        HttpResponse.json(
          { code: 'INVALID_CREDENTIALS', message: '틀림' },
          { status: 401 },
        ),
      ),
    )

    await expect(apiRequest('/missing')).rejects.toMatchObject({
      code: 'CONNECTION_FAILED',
    })
    await expect(apiRequest('/known')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
  })

  it('네트워크 오류와 HTML로 돌아온 보안 토큰은 연결 문제로 던진다', async () => {
    server.use(
      http.get('/api/auth/csrf', () => HttpResponse.html('<html></html>')),
      http.post('/api/echo', () => HttpResponse.error()),
      http.get('/api/net', () => HttpResponse.error()),
    )

    server.use(
      http.get(
        '/api/auth/csrf',
        () => new HttpResponse('not found', { status: 404 }),
      ),
    )
    await expect(apiRequest('/echo', { method: 'POST' })).rejects.toMatchObject(
      { code: 'CONNECTION_FAILED' },
    )

    await expect(apiRequest('/net')).rejects.toMatchObject({
      code: 'CONNECTION_FAILED',
    })
    await expect(apiRequest('/echo', { method: 'POST' })).rejects.toMatchObject(
      { code: 'CONNECTION_FAILED' },
    )
  })
})

describe('apiRequest의 액세스 JWT 자동 갱신', () => {
  // 'fresh'만 유효한 토큰으로 보고, 다른 토큰은 만료(ACCESS_TOKEN_EXPIRED)로 답합니다.
  function useJwtServer({ refreshOk = true } = {}) {
    const calls = { refresh: 0, data: 0 }

    server.use(
      http.get('/api/auth/csrf', () =>
        HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token: 'csrf' }),
      ),
      http.post('/api/auth/refresh', () => {
        calls.refresh += 1
        return refreshOk
          ? HttpResponse.json({ accessToken: 'fresh', expiresIn: 900 })
          : HttpResponse.json(
              { code: 'INVALID_REFRESH_TOKEN', message: '다시 로그인' },
              { status: 401 },
            )
      }),
      http.get('/api/data', ({ request }) => {
        calls.data += 1
        return request.headers.get('Authorization') === 'Bearer fresh'
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json(
              { code: 'ACCESS_TOKEN_EXPIRED', message: '만료' },
              { status: 401 },
            )
      }),
    )

    return calls
  }

  it('보관한 액세스 JWT를 Bearer 헤더로 보낸다', async () => {
    const calls = useJwtServer()
    setAccessToken('fresh')

    expect(await apiRequest('/data')).toEqual({ ok: true })
    expect(calls).toEqual({ refresh: 0, data: 1 })
  })

  it('만료되면 한 번 갱신하고 새 토큰으로 원래 요청을 한 번만 다시 보낸다', async () => {
    const calls = useJwtServer()
    setAccessToken('old')

    expect(await apiRequest('/data')).toEqual({ ok: true })
    expect(calls).toEqual({ refresh: 1, data: 2 })
  })

  it('여러 요청이 동시에 만료돼도 갱신은 한 번만 보낸다', async () => {
    const calls = useJwtServer()
    setAccessToken('old')

    await Promise.all([
      apiRequest('/data'),
      apiRequest('/data'),
      apiRequest('/data'),
    ])

    expect(calls.refresh).toBe(1)
  })

  it('갱신이 실패하면 반복하지 않고 토큰을 지운 뒤 만료 신호를 보낸다', async () => {
    const calls = useJwtServer({ refreshOk: false })
    const expired = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    setAccessToken('old')

    await expect(apiRequest('/data')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_REFRESH_TOKEN',
    })

    window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
    expect(calls).toEqual({ refresh: 1, data: 1 })
    expect(hasAccessToken()).toBe(false)
    expect(expired).toHaveBeenCalled()
  })

  it('만료가 아닌 401(로그인 실패 등)은 갱신하지 않는다', async () => {
    const calls = useJwtServer()
    server.use(
      http.get('/api/known', () =>
        HttpResponse.json(
          { code: 'INVALID_CREDENTIALS', message: '틀림' },
          { status: 401 },
        ),
      ),
    )

    await expect(apiRequest('/known')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
    expect(calls.refresh).toBe(0)
  })
})

describe('apiRequest의 오류 details 전달', () => {
  async function failWith(body: Record<string, unknown>) {
    server.use(
      http.get('/api/fail', () =>
        HttpResponse.json(body as never, { status: 400 }),
      ),
    )
    try {
      await apiRequest('/fail')
    } catch (error) {
      return error as ApiError
    }
    throw new Error('오류가 나야 합니다.')
  }

  it('오류 응답의 details를 ApiError.details로 넘긴다', async () => {
    const error = await failWith({
      code: 'INVALID_INPUT',
      message: '입력 확인',
      details: { field: 'email' },
    })

    expect(error.details).toEqual({ field: 'email' })
  })

  it('details가 없으면 기존처럼 code·message만 넘긴다', async () => {
    const error = await failWith({
      code: 'INVALID_INPUT',
      message: '입력 확인',
    })

    expect(error).toMatchObject({ code: 'INVALID_INPUT', details: undefined })
  })

  it('details가 null·배열·글자면 없는 것으로 본다', async () => {
    for (const details of [null, ['email'], 'email']) {
      const error = await failWith({ code: 'INVALID_INPUT', details })
      expect(error).toMatchObject({ code: 'INVALID_INPUT', details: undefined })
    }
  })

  it('JSON이 아닌 오류 응답은 details 없이 기존 처리대로 던진다', async () => {
    server.use(
      http.get('/api/fail', () => new HttpResponse('bad', { status: 400 })),
    )

    await expect(apiRequest('/fail')).rejects.toMatchObject({
      status: 400,
      code: 'UNKNOWN_ERROR',
      details: undefined,
    })
  })
})
