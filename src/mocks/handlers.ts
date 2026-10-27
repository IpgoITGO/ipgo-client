import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok' })
  }),
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string }

    if (body.email !== 'seller@a.com' || body.password !== 'pass1234') {
      return HttpResponse.json(
        {
          code: 'INVALID_CREDENTIALS',
          message: '이메일 또는 비밀번호가 맞지 않아요.',
        },
        { status: 401 },
      )
    }

    return HttpResponse.json({
      user: {
        email: body.email,
      },
    })
  }),
  http.post('/api/uploads', () => {
    return HttpResponse.json(
      { uploadId: 'upload-20261027', status: 'processing' },
      { status: 202 },
    )
  }),
]
