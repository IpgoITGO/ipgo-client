import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { authRoutes } from '../../auth/routes'
import { dashboardRoutes } from '../../features/dashboard/routes'
import { settingsRoutes } from '../../features/settings/routes'
import { skuRoutes } from '../../features/sku/routes'
import { uploadRoutes } from '../../features/upload/routes'
import { AppLayout } from '../ui/AppLayout'
import { NotFoundPage } from '../ui/NotFoundPage'
import { RouteErrorPage } from '../ui/RouteErrorPage'
import { PublicOnly, RequireAuth, RootRedirect } from './routeGuards'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootRedirect />,
    errorElement: <RouteErrorPage />,
  },
  {
    element: <PublicOnly />,
    children: authRoutes,
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <AppLayout />,
        children: [
          ...dashboardRoutes,
          ...uploadRoutes,
          ...settingsRoutes,
          ...skuRoutes,
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]

export const router = createBrowserRouter(routes)
