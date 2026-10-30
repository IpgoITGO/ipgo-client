import { createContext } from 'react'

export type User = {
  email: string
  name: string
  companyName: string
}

// loading: 새로고침 직후 A4로 로그인 여부를 확인하는 중
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type Credentials = {
  email: string
  password: string
}

export type AuthContextValue = {
  status: AuthStatus
  user: User | null
  // 로그인 유지 기간이 끝나 저절로 로그아웃됐는지. 로그인 화면이 안내합니다.
  sessionExpired: boolean
  signIn: (credentials: Credentials) => Promise<void>
  // 서버 로그아웃이 실패하면 던진다(로그인은 그대로).
  signOut: () => Promise<void>
  // 서버 로그아웃 실패를 알고도 나갈 때: 이 화면에서만 로그인을 잊는다.
  signOutLocally: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
