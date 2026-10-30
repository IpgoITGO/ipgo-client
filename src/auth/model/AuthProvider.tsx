import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { AUTH_EXPIRED_EVENT } from '../../shared/api/client'
import { forgetLocalLogin, getMe, login, logout, type Me } from '../api/authApi'
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
  const [sessionExpired, setSessionExpired] = useState(false)

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
      setSessionExpired(false)
    },
    [queryClient],
  )

  // 서버 로그아웃이 끝나야 화면 로그인을 지운다. 실패하면 로그인은 그대로 두고 오류를 던진다.
  const signOut = useCallback(async () => {
    await logout()
    clearSession()
  }, [clearSession])

  // 서버 로그아웃은 실패했지만 셀러가 알고서 나가기를 고른 경우: 이 화면에서만 잊는다.
  const signOutLocally = useCallback(() => {
    forgetLocalLogin()
    clearSession()
  }, [clearSession])

  // 로그인한 상태에서 401을 받았을 때만 만료로 봅니다. 로그인 전 A4나 로그인 실패의
  // 401은 정상 응답이므로 다른 화면의 데이터를 지우면 안 됩니다.
  const handleExpired = useCallback(() => {
    if (!queryClient.getQueryData(ME_KEY)) return
    clearSession()
    setSessionExpired(true)
  }, [clearSession, queryClient])

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired)
  }, [handleExpired])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: meQuery.isPending
        ? 'loading'
        : me
          ? 'authenticated'
          : 'anonymous',
      user: me ? toUser(me) : null,
      sessionExpired,
      signIn,
      signOut,
      signOutLocally,
    }),
    [me, meQuery.isPending, sessionExpired, signIn, signOut, signOutLocally],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
