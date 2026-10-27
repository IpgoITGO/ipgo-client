import type { RouteObject } from 'react-router-dom'

import { UploadPage } from './pages/UploadPage'
import { UploadResultPage } from './pages/UploadResultPage'

export const uploadRoutes: RouteObject[] = [
  {
    path: 'upload',
    element: <UploadPage />,
  },
  {
    path: 'upload/:uploadId/result',
    element: <UploadResultPage />,
  },
]
