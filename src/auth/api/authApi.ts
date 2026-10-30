import {
  ApiError,
  apiRequest,
  hasAccessToken,
  refreshAccessToken,
  resetCsrfToken,
  setAccessToken,
} from '../../shared/api/client'

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

// A2 로그인. 서버는 form 방식으로 받고 성공하면 200과 액세스 JWT를 주므로(server #28),
// 토큰을 보관한 뒤 A4로 사용자 정보를 받아 돌려준다.
export async function login(request: LoginRequest) {
  const { accessToken } = await apiRequest<{ accessToken: string }>(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(request),
    },
  )
  setAccessToken(accessToken)
  // 로그인하면 서버가 CSRF 토큰을 새로 발급하므로 토큰을 다시 받게 한다.
  resetCsrfToken()

  return apiRequest<Me>('/auth/me')
}

// A3 로그아웃. 리프레시 쿠키와 CSRF로 처리하고, 서버가 끝냈을 때만 액세스 토큰을 지운다.
// 실패하면 그대로 던진다. 서버 로그인이 남아 있어 새로고침하면 다시 로그인되므로, 화면이 알려야 한다(#32).
export async function logout() {
  await apiRequest<void>('/auth/logout', { method: 'POST' })
  forgetLocalLogin()
}

// 이 화면에서만 로그인을 잊는다. 서버 로그아웃이 실패했는데도 셀러가 나가기를 고른 경우.
export function forgetLocalLogin() {
  setAccessToken(null)
  resetCsrfToken()
}

// A4 내 정보. 새로고침으로 액세스 토큰을 잃었으면 리프레시 쿠키로 먼저 되살리고,
// 로그인하지 않았으면(401) null로 돌려준다.
export async function getMe(): Promise<Me | null> {
  try {
    if (!hasAccessToken()) await refreshAccessToken()
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
