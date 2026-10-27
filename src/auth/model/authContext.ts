import { createContext } from 'react'

export type User = {
  email: string
  name: string
  companyName: string
}

export type AuthContextValue = {
  user: User | null
  signIn: (email: string) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
