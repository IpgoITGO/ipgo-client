import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../../auth/model/useAuth'
import { AsyncState } from '../../shared/ui/AsyncState/AsyncState'

function AuthChecking() {
  return (
    <AsyncState
      description="잠시만 기다려 주세요."
      status="loading"
      title="로그인 상태를 확인하고 있어요"
    />
  )
}

export function RootRedirect() {
  const { status } = useAuth()

  if (status === 'loading') return <AuthChecking />

  return (
    <Navigate
      to={status === 'authenticated' ? '/dashboard' : '/login'}
      replace
    />
  )
}

// 로그인한 사람은 로그인·회원가입 화면 대신 원래 가려던 화면으로 보냅니다.
export function PublicOnly() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <AuthChecking />

  const from = (location.state as { from?: { pathname: string } } | null)?.from

  return status === 'authenticated' ? (
    <Navigate to={from ?? '/dashboard'} replace />
  ) : (
    <Outlet />
  )
}

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <AuthChecking />

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
