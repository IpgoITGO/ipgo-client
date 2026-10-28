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
  signIn: (credentials: Credentials) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
