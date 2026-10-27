import { type PropsWithChildren, useCallback, useMemo, useState } from 'react'

import { AuthContext, type User } from './authContext'

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)

  const signIn = useCallback((email: string) => {
    setUser({ email })
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
  }, [])

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
