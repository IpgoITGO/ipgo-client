import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../../auth/model/useAuth'

export function RootRedirect() {
  const { user } = useAuth()

  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

export function PublicOnly() {
  const { user } = useAuth()

  return user ? <Navigate to="/dashboard" replace /> : <Outlet />
}

export function RequireAuth() {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
