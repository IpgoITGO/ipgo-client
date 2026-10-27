import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { AUTH_EXPIRED_EVENT } from '../../shared/api/client'
import { AuthContext, type User } from './authContext'

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)

  const signIn = useCallback((email: string) => {
    setUser({
      email,
      name: '박셀러',
      companyName: '펫스낵랩',
    })
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
  }, [])

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, signOut)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, signOut)
  }, [signOut])

  const value = useMemo(
    () => ({
      user,
      signIn,
      signOut,
    }),
    [signIn, signOut, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
