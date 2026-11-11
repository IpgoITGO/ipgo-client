import type { RouteObject } from 'react-router-dom'

import {
  BillingAuthFailPage,
  BillingAuthSuccessPage,
} from './pages/BillingReturnPages'
import { CheckoutPage } from './pages/CheckoutPage'
import { PlansPage } from './pages/PlansPage'

export const billingRoutes: RouteObject[] = [
  { path: 'plans', element: <PlansPage /> },
  { path: 'checkout', element: <CheckoutPage /> },
  { path: 'billing/auth/success', element: <BillingAuthSuccessPage /> },
  { path: 'billing/auth/fail', element: <BillingAuthFailPage /> },
]
