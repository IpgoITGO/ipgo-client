import { ReceiptCorrectionsPage } from '../../features/receipts/pages/ReceiptCorrectionsPage'
import { createBrowserRouter, type RouteObject } from 'react-router-dom'

import { authRoutes } from '../../auth/routes'
import { PolicyPage } from '../../features/legal/pages/PolicyPages'
import { accountRoutes } from '../../features/account/routes'
import { billingRoutes } from '../../features/billing/routes'
import { dashboardRoutes } from '../../features/dashboard/routes'
import { settingsRoutes } from '../../features/settings/routes'
import { skuRoutes } from '../../features/sku/routes'
import { uploadRoutes } from '../../features/upload/routes'
import { AppLayout } from '../ui/AppLayout'
import { NotFoundPage } from '../ui/NotFoundPage'
import { RouteErrorPage } from '../ui/RouteErrorPage'
import { PublicOnly, RequireAuth, RootRedirect } from './routeGuards'

export const routes: RouteObject[] = [
  { path: '/terms', element: <PolicyPage kind="terms" /> },
  { path: '/privacy', element: <PolicyPage kind="privacy" /> },
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
          { path: '/receipt-corrections', element: <ReceiptCorrectionsPage /> },
          {
            path: '/receipt-corrections/:reviewId',
            element: <ReceiptCorrectionsPage />,
          },
          ...uploadRoutes,
          ...settingsRoutes,
          ...skuRoutes,
          ...billingRoutes,
          ...accountRoutes,
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
