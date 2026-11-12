import type { RouteObject } from 'react-router-dom'

import {
  BillingAuthFailPage,
  BillingAuthSuccessPage,
} from './pages/BillingReturnPages'
import { CheckoutPage } from './pages/CheckoutPage'
import { NormalReturnPage } from './pages/NormalReturnPage'
import { PlansPage } from './pages/PlansPage'

export const billingRoutes: RouteObject[] = [
  { path: 'plans', element: <PlansPage /> },
  { path: 'payment/success', element: <NormalReturnPage /> },
  { path: 'payment/fail', element: <NormalReturnPage failed /> },
  { path: 'checkout', element: <CheckoutPage /> },
  { path: 'billing/auth/success', element: <BillingAuthSuccessPage /> },
  { path: 'billing/auth/fail', element: <BillingAuthFailPage /> },
]
