import { http, HttpResponse } from 'msw'

// docs/design/api-spec.docx 3.1절의 요청·응답 모양을 따르는 MSW handler입니다.
// 가입한 계정은 메모리에만 있어 브라우저를 새로고침하면 시험 계정만 남습니다.

export const MOCK_VERIFICATION_CODE = '482915'

const SESSION_COOKIE = 'mock_session'
const CODE_LIFETIME_MS = 10 * 60 * 1000
const RESEND_INTERVAL_MS = 60 * 1000
const TOKEN_LIFETIME_MS = 30 * 60 * 1000
const MAX_CODE_FAILURES = 5

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

// 테스트 사이에 가짜 서버 상태를 처음으로 돌립니다.
export function resetAuthMock() {
  users = seedUsers.map((user) => ({ ...user }))
  codes = new Map()
  tokens = new Map()
  setSession(null)
}

// 세션은 쿠키 하나로 흉내 냅니다. 실제 방식(세션/JWT)은 백엔드가 정합니다.
function readSession() {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`),
  )
  return match ? decodeURIComponent(match[1]) : null
}

function setSession(email: string | null) {
  document.cookie = email
    ? `${SESSION_COOKIE}=${encodeURIComponent(email)}; path=/`
    : `${SESSION_COOKIE}=; path=/; max-age=0`
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
  details?: Record<string, unknown>,
) {
  return HttpResponse.json({ code, message, details }, { status })
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isName(value: unknown) {
  return (
    typeof value === 'string' &&
    value.trim().length >= 1 &&
    value.trim().length <= 50
  )
}

export const authHandlers = [
  // A2 로그인
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string }
    const user = users.find(
      (item) => item.email === body.email && item.password === body.password,
    )

    if (!user) {
      return error(401, 'LOGIN_FAILED', '이메일 또는 비밀번호가 맞지 않아요.')
    }

    setSession(user.email)
    return HttpResponse.json(toMe(user))
  }),

  // A3 로그아웃
  http.post('/api/auth/logout', () => {
    setSession(null)
    return new HttpResponse(null, { status: 204 })
  }),

  // A4 내 정보
  http.get('/api/auth/me', () => {
    const user = users.find((item) => item.email === readSession())

    if (!user) {
      return error(401, 'UNAUTHORIZED', '로그인이 필요해요.')
    }

    return HttpResponse.json(toMe(user))
  }),

  // A5 이메일 중복 확인
  http.get('/api/auth/email-availability', ({ request }) => {
    const email = new URL(request.url).searchParams.get('email') ?? ''

    if (!isEmail(email)) {
      return error(400, 'INVALID_INPUT', '이메일 형식이 아니에요.', {
        field: 'email',
      })
    }

    return HttpResponse.json({
      available: !users.some((item) => item.email === email),
    })
  }),

  // A6 인증 코드 발송 · 다시 보내기 (10분 유효, 1분에 1번)
  http.post('/api/auth/email-verifications', async ({ request }) => {
    const { email } = (await request.json()) as { email: string }

    if (users.some((item) => item.email === email)) {
      return error(409, 'EMAIL_EXISTS', '이미 가입한 이메일이에요.')
    }

    const previous = codes.get(email)
    if (previous && Date.now() - previous.sentAt < RESEND_INTERVAL_MS) {
      return error(
        429,
        'TOO_MANY_REQUESTS',
        '인증 메일은 1분에 한 번 보낼 수 있어요.',
      )
    }

    codes.set(email, {
      sentAt: Date.now(),
      expiresAt: Date.now() + CODE_LIFETIME_MS,
      failures: 0,
    })
    if (import.meta.env.MODE !== 'test') {
      console.info(`[MSW] ${email} 인증 코드: ${MOCK_VERIFICATION_CODE}`)
    }

    return HttpResponse.json({ expiresIn: 600 }, { status: 202 })
  }),

  // A7 인증 코드 확인 → 인증 토큰 (30분 유효, 5번 틀리면 코드 무효)
  http.post('/api/auth/email-verifications/confirm', async ({ request }) => {
    const { email, code } = (await request.json()) as {
      email: string
      code: string
    }
    const issued = codes.get(email)

    if (!issued || Date.now() > issued.expiresAt) {
      return error(
        400,
        'VERIFICATION_EXPIRED',
        '인증 코드 시간이 지났어요. 코드를 다시 받아 주세요.',
      )
    }

    if (code !== MOCK_VERIFICATION_CODE) {
      issued.failures += 1
      if (issued.failures >= MAX_CODE_FAILURES) {
        codes.delete(email)
        return error(
          400,
          'VERIFICATION_FAILED',
          '5번 틀려서 이 코드는 더 쓸 수 없어요. 코드를 다시 받아 주세요.',
        )
      }
      return error(
        400,
        'VERIFICATION_FAILED',
        `코드가 맞지 않아요. ${MAX_CODE_FAILURES - issued.failures}번 더 해 볼 수 있어요.`,
      )
    }

    codes.delete(email)
    const verificationToken = `vt_${crypto.randomUUID()}`
    tokens.set(verificationToken, {
      email,
      expiresAt: Date.now() + TOKEN_LIFETIME_MS,
    })

    return HttpResponse.json({ verificationToken })
  }),

  // A1 회원가입
  http.post('/api/auth/signup', async ({ request }) => {
    const body = (await request.json()) as {
      companyName?: string
      businessRegNo?: string | null
      managerName?: string
      email: string
      password: string
      verificationToken?: string
    }

    if (!body.verificationToken) {
      return error(
        400,
        'VERIFICATION_REQUIRED',
        '이메일 인증을 먼저 해 주세요.',
      )
    }

    const token = tokens.get(body.verificationToken)
    if (!token || token.email !== body.email || Date.now() > token.expiresAt) {
      return error(
        400,
        'VERIFICATION_EXPIRED',
        '인증 시간이 지났어요. 이메일 인증을 다시 해 주세요.',
      )
    }

    if (users.some((item) => item.email === body.email)) {
      return error(409, 'EMAIL_EXISTS', '이미 가입한 이메일이에요.')
    }

    if (!isName(body.companyName)) {
      return error(400, 'INVALID_INPUT', '회사명은 1~50자로 입력해 주세요.', {
        field: 'companyName',
      })
    }
    if (!isName(body.managerName)) {
      return error(
        400,
        'INVALID_INPUT',
        '담당자 이름은 1~50자로 입력해 주세요.',
        { field: 'managerName' },
      )
    }
    if (body.businessRegNo != null && !/^\d{10}$/.test(body.businessRegNo)) {
      return error(
        400,
        'INVALID_INPUT',
        '사업자등록번호는 숫자 10자리로 입력해 주세요.',
        { field: 'businessRegNo' },
      )
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(body.password)) {
      return error(
        400,
        'INVALID_INPUT',
        '비밀번호는 8자 이상, 영문과 숫자를 섞어 주세요.',
        { field: 'password' },
      )
    }

    tokens.delete(body.verificationToken)
    const user: MockUser = {
      userId: users.length + 1,
      email: body.email,
      password: body.password,
      managerName: body.managerName!.trim(),
      companyName: body.companyName!.trim(),
      businessRegNo: body.businessRegNo ?? null,
    }
    users.push(user)

    return HttpResponse.json(
      { userId: user.userId, email: user.email },
      { status: 201 },
    )
  }),
]
