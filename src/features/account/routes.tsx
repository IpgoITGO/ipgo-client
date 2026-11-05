import type { RouteObject } from 'react-router-dom'

import { AccountPage } from './pages/AccountPage'

export const accountRoutes: RouteObject[] = [
  { path: 'account', element: <AccountPage /> },
]
