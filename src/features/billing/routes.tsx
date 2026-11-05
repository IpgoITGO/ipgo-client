import type { RouteObject } from 'react-router-dom'

import { CheckoutPage } from './pages/CheckoutPage'
import { PlansPage } from './pages/PlansPage'

export const billingRoutes: RouteObject[] = [
  { path: 'plans', element: <PlansPage /> },
  { path: 'checkout', element: <CheckoutPage /> },
]
