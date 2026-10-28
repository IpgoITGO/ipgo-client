import { ApiError, apiRequest, resetCsrfToken } from '../../shared/api/client'

// docs/design/api-spec.docx 3.1절 (A1~A7). 기본 경로 `/api`는 apiRequest가 붙입니다.

export type Me = {
  userId: number
  email: string
  managerName: string
  companyName: string
}

export type LoginRequest = {
  email: string
  password: string
}

export type SignUpRequest = {
  companyName: string
  businessRegNo: string | null
  managerName: string
  email: string
  password: string
  verificationToken: string
}

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// A2 로그인. 서버는 form 방식으로 받고 성공하면 204(본문 없음)를 주므로,
// 이어서 A4로 사용자 정보를 받아 돌려준다.
export async function login(request: LoginRequest) {
  await apiRequest<void>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(request),
  })
  // 로그인하면 서버가 세션과 CSRF 토큰을 새로 발급하므로 토큰을 다시 받게 한다.
  resetCsrfToken()

  return apiRequest<Me>('/auth/me')
}

// A3 로그아웃
export async function logout() {
  try {
    await apiRequest<void>('/auth/logout', { method: 'POST' })
  } finally {
    resetCsrfToken()
  }
}

// A4 내 정보. 로그인하지 않았으면 401이므로 null로 돌려준다.
export async function getMe(): Promise<Me | null> {
  try {
    return await apiRequest<Me>('/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

// A5 이메일 중복 확인
export function checkEmailAvailability(email: string) {
  return apiRequest<{ available: boolean }>(
    `/auth/email-availability?email=${encodeURIComponent(email)}`,
  )
}

// A6 인증 코드 발송 · 다시 보내기
export function sendVerificationCode(email: string) {
  return apiRequest<{ expiresIn: number }>(
    '/auth/email-verifications',
    postJson({ email }),
  )
}

// A7 인증 코드 확인
export function confirmVerificationCode(request: {
  email: string
  code: string
}) {
  return apiRequest<{ verificationToken: string }>(
    '/auth/email-verifications/confirm',
    postJson(request),
  )
}

// A1 회원가입
export function signUp(request: SignUpRequest) {
  return apiRequest<Me>('/auth/signup', postJson(request))
}
