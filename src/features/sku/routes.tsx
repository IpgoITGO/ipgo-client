import type { RouteObject } from 'react-router-dom'

import { SkuPage } from './pages/SkuPage'

export const skuRoutes: RouteObject[] = [
  {
    path: 'sku/:skuId',
    element: <SkuPage />,
  },
]
