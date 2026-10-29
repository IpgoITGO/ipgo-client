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

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }

    const errorBody = await readJson<ErrorBody>(response)
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

  return request(createApiUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
      ...(csrf ? { [csrf.headerName]: csrf.token } : {}),
    },
  })
}

async function getCsrfToken() {
  if (csrfToken) return csrfToken

  const response = await request(createApiUrl('/auth/csrf'), {
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
