import { http, HttpResponse } from 'msw'

import { PASSWORD_RULE } from '../model/passwordRule'

// ipgo-server의 인증 API 규칙(PR #7·#9·#13의 README)을 따르는 MSW handler입니다.
// 오류 code 이름과 응답 모양은 서버 기준입니다. API 명세서와 다른 곳은 서버를 따릅니다.
// 가입한 계정은 메모리에만 있어 브라우저를 새로고침하면 시험 계정만 남습니다.

export const MOCK_VERIFICATION_CODE = '482915'

const REFRESH_COOKIE = 'mock_refresh'
const ACCESS_LIFETIME_SECONDS = 15 * 60
const CODE_LIFETIME_MS = 10 * 60 * 1000
const RESEND_INTERVAL_MS = 60 * 1000
const TOKEN_LIFETIME_MS = 30 * 60 * 1000
const MAX_CODE_FAILURES = 5
const CSRF_HEADER = 'X-CSRF-TOKEN'

type MockUser = {
  userId: number
  email: string
  password: string
  managerName: string
  companyName: string
  businessRegNo: string | null
}

const seedUsers: MockUser[] = [
  {
    userId: 1,
    email: 'seller@a.com',
    password: 'pass1234',
    managerName: '박셀러',
    companyName: '펫스낵랩',
    businessRegNo: null,
  },
]

let users = seedUsers.map((user) => ({ ...user }))
let codes = new Map<
  string,
  { sentAt: number; expiresAt: number; failures: number }
>()
let tokens = new Map<string, { email: string; expiresAt: number }>()
// 액세스 JWT 대신 무작위 문자열을 씁니다. 메모리에만 있어 새로고침하면 사라지고 갱신으로 다시 받습니다.
let accessTokens = new Map<string, { email: string; expiresAt: number }>()
// 서버처럼 변경 요청에는 CSRF 토큰이 필요하고, 로그인·로그아웃 때 토큰이 새로 바뀝니다.
let csrfToken = crypto.randomUUID()

// 테스트 사이에 가짜 서버 상태를 처음으로 돌립니다.
export function resetAuthMock() {
  users = seedUsers.map((user) => ({ ...user }))
  codes = new Map()
  tokens = new Map()
  accessTokens = new Map()
  csrfToken = crypto.randomUUID()
  setSession(null)
}

// 테스트에서 15분이 지난 것처럼 지금 가진 액세스 토큰을 모두 만료시킵니다.
export function expireMockAccessTokens() {
  accessTokens.forEach((token) => (token.expiresAt = 0))
}

function issueAccessToken(email: string) {
  const accessToken = crypto.randomUUID()
  accessTokens.set(accessToken, {
    email,
    expiresAt: Date.now() + ACCESS_LIFETIME_SECONDS * 1000,
  })
  return HttpResponse.json({
    accessToken,
    tokenType: 'Bearer',
    expiresIn: ACCESS_LIFETIME_SECONDS,
  })
}

// 서버처럼 Bearer 토큰을 확인합니다. 만료만 ACCESS_TOKEN_EXPIRED로 구분해 갱신하게 합니다.
function authenticate(request: Request) {
  const header = request.headers.get('Authorization') ?? ''
  const token = accessTokens.get(header.replace(/^Bearer /, ''))

  if (!header) return error(401, 'UNAUTHENTICATED', '로그인이 필요합니다.')
  if (!token) return error(401, 'INVALID_ACCESS_TOKEN', '다시 로그인해주세요.')
  if (token.expiresAt <= Date.now()) {
    return error(401, 'ACCESS_TOKEN_EXPIRED', '로그인 시간이 만료되었습니다.')
  }
  return users.find((item) => item.email === token.email) ?? null
}

function csrfDenied(request: Request) {
  return request.headers.get(CSRF_HEADER) === csrfToken
    ? null
    : error(403, 'FORBIDDEN', '접근 권한 또는 CSRF 토큰을 확인해주세요.')
}

// 리프레시 쿠키(서버는 HttpOnly `ipgo_refresh`)를 이메일을 담은 쿠키 하나로 흉내 냅니다.
function readSession() {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${REFRESH_COOKIE}=([^;]*)`),
  )
  return match ? decodeURIComponent(match[1]) : null
}

function setSession(email: string | null) {
  document.cookie = email
    ? `${REFRESH_COOKIE}=${encodeURIComponent(email)}; path=/`
    : `${REFRESH_COOKIE}=; path=/; max-age=0`
}

// 서버는 이메일을 소문자로 정규화합니다.
function normalizeEmail(email: unknown) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function toMe(user: MockUser) {
  return {
    userId: user.userId,
    email: user.email,
    managerName: user.managerName,
    companyName: user.companyName,
  }
}

function error(
  status: number,
  code: string,
  message: string,
  details?: { field: string },
) {
  return HttpResponse.json({ code, message, details }, { status })
}

function invalidInput(field: string) {
  return error(400, 'INVALID_INPUT', '입력값의 형식과 길이를 확인해주세요.', {
    field,
  })
}

function isEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isName(value: unknown) {
  return (
    typeof value === 'string' &&
    value.trim().length >= 1 &&
    value.trim().length <= 50
  )
}

export const authHandlers = [
  // CSRF 토큰 받기 (로그인 전에도 호출 가능)
  http.get('/api/auth/csrf', () =>
    HttpResponse.json({
      headerName: CSRF_HEADER,
      parameterName: '_csrf',
      token: csrfToken,
    }),
  ),

  // A2 로그인. 서버는 form 방식으로 받고 성공하면 200과 액세스 JWT, 리프레시 쿠키를 줍니다.
  http.post('/api/auth/login', async ({ request }) => {
    const denied = csrfDenied(request)
    if (denied) return denied

    const form = new URLSearchParams(await request.text())
    const email = normalizeEmail(form.get('email'))
    const user = users.find(
      (item) => item.email === email && item.password === form.get('password'),
    )

    if (!user) {
      return error(
        401,
        'INVALID_CREDENTIALS',
        '이메일 또는 비밀번호를 확인해주세요.',
      )
    }

    setSession(user.email)
    csrfToken = crypto.randomUUID()
    return issueAccessToken(user.email)
  }),

  // 갱신. 리프레시 쿠키와 CSRF로 새 액세스 JWT를 줍니다. (Bearer는 보지 않음)
  http.post('/api/auth/refresh', ({ request }) => {
    const denied = csrfDenied(request)
    if (denied) return denied

    const email = readSession()
    if (!email || !users.some((item) => item.email === email)) {
      return error(401, 'INVALID_REFRESH_TOKEN', '다시 로그인해주세요.')
    }
    return issueAccessToken(email)
  }),

  // A3 로그아웃. 그 로그인에서 받은 액세스 JWT도 바로 쓸 수 없게 됩니다.
  http.post('/api/auth/logout', ({ request }) => {
    const denied = csrfDenied(request)
    if (denied) return denied

    const email = readSession()
    accessTokens.forEach((token, key) => {
      if (token.email === email) accessTokens.delete(key)
    })
    setSession(null)
    csrfToken = crypto.randomUUID()
    return new HttpResponse(null, { status: 204 })
  }),

  // A4 내 정보
  http.get('/api/auth/me', ({ request }) => {
    const user = authenticate(request)
    if (user instanceof Response) return user
    if (!user) return error(401, 'UNAUTHENTICATED', '로그인이 필요합니다.')

    return HttpResponse.json(toMe(user))
  }),

  // A5 이메일 중복 확인
  http.get('/api/auth/email-availability', ({ request }) => {
    const email = normalizeEmail(
      new URL(request.url).searchParams.get('email') ?? '',
    )

    if (!isEmail(email)) return invalidInput('email')

    return HttpResponse.json({
      available: !users.some((item) => item.email === email),
    })
  }),

  // A6 인증 코드 발송 · 다시 보내기 (10분 유효, 60초에 한 번)
  http.post('/api/auth/email-verifications', async ({ request }) => {
    const denied = csrfDenied(request)
    if (denied) return denied

    const body = (await request.json()) as { email?: string }
    const email = normalizeEmail(body.email)

    if (!isEmail(email)) return invalidInput('email')

    if (users.some((item) => item.email === email)) {
      return error(409, 'DUPLICATE_EMAIL', '이미 가입된 이메일입니다.')
    }

    const previous = codes.get(email)
    if (previous && Date.now() - previous.sentAt < RESEND_INTERVAL_MS) {
      return error(
        429,
        'EMAIL_VERIFICATION_RATE_LIMITED',
        '잠시 후 다시 요청해주세요.',
      )
    }

    // 새로 보내면 이전 코드와 가입 토큰은 무효가 됩니다.
    codes.set(email, {
      sentAt: Date.now(),
      expiresAt: Date.now() + CODE_LIFETIME_MS,
      failures: 0,
    })
    for (const [token, issued] of tokens) {
      if (issued.email === email) tokens.delete(token)
    }
    if (import.meta.env.MODE !== 'test') {
      console.info(`[MSW] ${email} 인증 코드: ${MOCK_VERIFICATION_CODE}`)
    }

    return HttpResponse.json({ expiresIn: 600 }, { status: 202 })
  }),

  // A7 인증 코드 확인 → 가입 토큰 (30분 유효, 5번 틀리면 그 코드는 무효)
  http.post('/api/auth/email-verifications/confirm', async ({ request }) => {
    const denied = csrfDenied(request)
    if (denied) return denied

    const body = (await request.json()) as { email?: string; code?: string }
    const email = normalizeEmail(body.email)

    if (!isEmail(email)) return invalidInput('email')
    if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
      return invalidInput('code')
    }

    const issued = codes.get(email)
    if (!issued || issued.failures >= MAX_CODE_FAILURES) {
      return error(400, 'INVALID_EMAIL_CODE', '인증 코드가 올바르지 않습니다.')
    }
    if (Date.now() > issued.expiresAt) {
      return error(400, 'EMAIL_CODE_EXPIRED', '인증 코드가 만료되었습니다.')
    }
    if (body.code !== MOCK_VERIFICATION_CODE) {
      issued.failures += 1
      return error(400, 'INVALID_EMAIL_CODE', '인증 코드가 올바르지 않습니다.')
    }

    codes.delete(email)
    const verificationToken = Array.from(
      crypto.getRandomValues(new Uint8Array(22)),
      (byte) => byte.toString(16).padStart(2, '0'),
    )
      .join('')
      .slice(0, 43)
    tokens.set(verificationToken, {
      email,
      expiresAt: Date.now() + TOKEN_LIFETIME_MS,
    })

    return HttpResponse.json({ verificationToken })
  }),

  // A1 회원가입. 입력 오류는 칸 이름(details.field)을 하나 알려 줍니다. (이름순으로 첫 칸)
  http.post('/api/auth/signup', async ({ request }) => {
    const denied = csrfDenied(request)
    if (denied) return denied

    const body = (await request.json()) as {
      companyName?: string
      businessRegNo?: string | null
      managerName?: string
      email?: string
      password?: string
      verificationToken?: string
    }
    const email = normalizeEmail(body.email)

    const invalid: string[] = []
    if (!isName(body.companyName)) invalid.push('companyName')
    if (!isName(body.managerName)) invalid.push('managerName')
    if (body.businessRegNo != null && !/^\d{10}$/.test(body.businessRegNo)) {
      invalid.push('businessRegNo')
    }
    if (!isEmail(email)) invalid.push('email')
    if (
      typeof body.password !== 'string' ||
      !PASSWORD_RULE.test(body.password)
    ) {
      invalid.push('password')
    }
    if (!body.verificationToken) invalid.push('verificationToken')
    if (invalid.length > 0) return invalidInput(invalid.sort()[0])

    const token = tokens.get(body.verificationToken!)
    if (!token || token.email !== email || Date.now() > token.expiresAt) {
      return error(
        400,
        'INVALID_VERIFICATION_TOKEN',
        '가입 인증이 올바르지 않거나 만료되었습니다.',
      )
    }

    if (users.some((item) => item.email === email)) {
      return error(409, 'DUPLICATE_EMAIL', '이미 가입된 이메일입니다.')
    }

    tokens.delete(body.verificationToken!)
    const user: MockUser = {
      userId: users.length + 1,
      email,
      password: body.password!,
      managerName: body.managerName!.trim(),
      companyName: body.companyName!.trim(),
      businessRegNo: body.businessRegNo ?? null,
    }
    users.push(user)

    return HttpResponse.json(toMe(user), { status: 201 })
  }),
]
