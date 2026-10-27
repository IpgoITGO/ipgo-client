import { http, HttpResponse } from 'msw'

import { authHandlers } from '../auth/mocks/handlers'

export const handlers = [
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok' })
  }),
  ...authHandlers,
  http.post('/api/uploads', () => {
    return HttpResponse.json(
      { uploadId: 'upload-20261027', status: 'processing' },
      { status: 202 },
    )
  }),
]
