import type { RouteObject } from 'react-router-dom'

import { LoginPage } from './pages/LoginPage'
import { SignUpPage } from './pages/SignUpPage'

export const authRoutes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/signup',
    element: <SignUpPage />,
  },
]
