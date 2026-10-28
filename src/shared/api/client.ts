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
    throw new ApiError(
      response.status,
      errorBody?.code ?? 'UNKNOWN_ERROR',
      errorBody?.message ?? '요청을 처리하지 못했습니다.',
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

async function send(
  path: string,
  init: RequestInit | undefined,
  needsCsrf: boolean,
) {
  const csrf = needsCsrf ? await getCsrfToken() : null

  return fetch(createApiUrl(path), {
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

  const response = await fetch(createApiUrl('/auth/csrf'), {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new ApiError(
      response.status,
      'CSRF_UNAVAILABLE',
      '요청에 필요한 보안 정보를 받지 못했습니다.',
    )
  }

  csrfToken = (await response.json()) as CsrfToken
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
