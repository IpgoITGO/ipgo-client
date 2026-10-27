import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type PropsWithChildren, useCallback, useEffect, useMemo } from 'react'

import { AUTH_EXPIRED_EVENT } from '../../shared/api/client'
import { getMe, login, logout, type Me } from '../api/authApi'
import {
  AuthContext,
  type AuthContextValue,
  type Credentials,
  type User,
} from './authContext'

const ME_KEY = ['auth', 'me'] as const

function toUser(me: Me): User {
  return { email: me.email, name: me.managerName, companyName: me.companyName }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const meQuery = useQuery({
    queryKey: ME_KEY,
    queryFn: getMe,
    retry: false,
    staleTime: Infinity,
  })
  const me = meQuery.data ?? null

  // 화면의 로그인 상태만 지웁니다. 서버를 부르지 않으므로
  // 401 → 만료 신호 → 지우기가 서로를 다시 부르지 않습니다.
  const clearSession = useCallback(() => {
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== ME_KEY[0],
    })
    queryClient.setQueryData(ME_KEY, null)
  }, [queryClient])

  const signIn = useCallback(
    async (credentials: Credentials) => {
      queryClient.setQueryData(ME_KEY, await login(credentials))
    },
    [queryClient],
  )

  const signOut = useCallback(async () => {
    clearSession()
    try {
      await logout()
    } catch {
      // 화면 상태는 이미 지웠으므로 서버 응답 실패는 무시합니다.
    }
  }, [clearSession])

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, clearSession)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, clearSession)
  }, [clearSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: meQuery.isPending
        ? 'loading'
        : me
          ? 'authenticated'
          : 'anonymous',
      user: me ? toUser(me) : null,
      signIn,
      signOut,
    }),
    [me, meQuery.isPending, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
