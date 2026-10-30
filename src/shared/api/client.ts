import { env } from '../config/env'

export const AUTH_EXPIRED_EVENT = 'ipgo:auth-expired'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// 서버에 닿지 못했거나 서버가 아닌 곳(예: 가짜 서버가 안 붙어 홈페이지 HTML)이 답한 경우의 code입니다.
export const CONNECTION_FAILED = 'CONNECTION_FAILED'
const CONNECTION_FAILED_MESSAGE =
  '서버에 연결하지 못했어요. 새로고침한 뒤 다시 시도해 주세요. 계속되면 알려 주세요.'

function connectionFailed(status = 0) {
  return new ApiError(status, CONNECTION_FAILED, CONNECTION_FAILED_MESSAGE)
}

type ErrorBody = {
  code?: string
  message?: string
}

type CsrfToken = {
  headerName: string
  token: string
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// 서버는 변경 요청(POST 등)마다 CSRF 토큰을 요구합니다. 한 번 받은 토큰을 재사용합니다.
let csrfToken: CsrfToken | null = null

// 로그인·로그아웃처럼 서버가 세션과 토큰을 새로 발급할 때 호출해 토큰을 다시 받게 합니다.
export function resetCsrfToken() {
  csrfToken = null
}

// 액세스 JWT(15분)는 메모리에만 둡니다. 새로고침으로 잃으면 리프레시 쿠키로 다시 받습니다.
let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function hasAccessToken() {
  return accessToken !== null
}

const REFRESH_PATH = '/auth/refresh'

// 여러 요청이 동시에 만료돼도 갱신은 한 번만 보내고 나머지는 같은 결과를 기다립니다.
// 서버가 리프레시 토큰을 갱신마다 바꾸므로 두 번 보내면 두 번째가 재사용으로 거절됩니다.
let refreshing: Promise<void> | null = null

export function refreshAccessToken() {
  refreshing ??= apiRequest<{ accessToken: string }>(REFRESH_PATH, {
    method: 'POST',
  })
    .then(
      (body) => setAccessToken(body.accessToken),
      (error: unknown) => {
        setAccessToken(null)
        throw error
      },
    )
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const needsCsrf = !SAFE_METHODS.has((init?.method ?? 'GET').toUpperCase())
  let response = await send(path, init, needsCsrf)

  // 토큰이 바뀌었을 수 있으므로 403이면 새 토큰으로 한 번만 다시 시도합니다.
  if (response.status === 403 && needsCsrf) {
    resetCsrfToken()
    response = await send(path, init, needsCsrf)
  }

  let errorBody: ErrorBody | null = null
  if (!response.ok) errorBody = await readJson<ErrorBody>(response)

  // 액세스 JWT 만료만 갱신 대상입니다. 갱신하고 원래 요청을 한 번만 다시 보냅니다.
  // 갱신 요청 자신은 갱신하지 않고, 갱신이 실패하면 그 오류(401)를 그대로 던집니다.
  if (errorBody?.code === 'ACCESS_TOKEN_EXPIRED' && path !== REFRESH_PATH) {
    await refreshAccessToken()
    response = await send(path, init, needsCsrf)
    errorBody = response.ok ? null : await readJson<ErrorBody>(response)
  }

  if (!response.ok) {
    if (response.status === 401) {
      setAccessToken(null)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
      }
    }

    // JSON이 아닌 404·5xx 응답은 우리 서버가 아니라 다른 곳이 답한 것이라 연결 문제로 봅니다.
    if (!errorBody && (response.status === 404 || response.status >= 500)) {
      throw connectionFailed(response.status)
    }
    throw new ApiError(
      response.status,
      errorBody?.code ?? 'UNKNOWN_ERROR',
      errorBody?.message ?? '요청을 처리하지 못했습니다.',
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  const body = await readJson<T>(response)
  // 성공(200)인데 JSON이 아니면 홈페이지 HTML 같은 엉뚱한 응답입니다.
  if (body === null) throw connectionFailed(response.status)
  return body
}

// 네트워크 오류(서버 꺼짐, 인터넷 끊김, 브라우저 차단)는 fetch가 TypeError로 던집니다.
async function request(url: string, init?: RequestInit) {
  try {
    return await fetch(url, init)
  } catch {
    throw connectionFailed()
  }
}

async function send(
  path: string,
  init: RequestInit | undefined,
  needsCsrf: boolean,
) {
  const csrf = needsCsrf ? await getCsrfToken() : null

  // 리프레시·CSRF 쿠키가 로그인·갱신·로그아웃에 함께 가야 하므로 쿠키를 항상 보냅니다.
  return request(createApiUrl(path), {
    credentials: 'include',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
      ...(csrf ? { [csrf.headerName]: csrf.token } : {}),
    },
  })
}

async function getCsrfToken() {
  if (csrfToken) return csrfToken

  const response = await request(createApiUrl('/auth/csrf'), {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    // 보안 토큰 주소가 없거나(404) 서버가 죽은(5xx) 경우는 연결 문제로 봅니다.
    if (response.status === 404 || response.status >= 500) {
      throw connectionFailed(response.status)
    }
    throw new ApiError(
      response.status,
      'CSRF_UNAVAILABLE',
      '요청에 필요한 보안 정보를 받지 못했습니다.',
    )
  }

  const body = await readJson<CsrfToken>(response)
  if (!body?.token) throw connectionFailed(response.status)
  csrfToken = body
  return csrfToken
}

function createApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path
  }

  return `${env.apiBaseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}
