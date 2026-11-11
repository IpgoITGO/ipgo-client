import { http, HttpResponse } from 'msw'

import { mockAccountKey } from '../../../auth/mocks/handlers'

// 가짜 서버: 비밀번호 'pass1234'(시험 계정)이면 탈퇴 성공(204)
export const withdrawHandlers = [
  http.post('/api/account/withdraw', async ({ request }) => {
    if (!mockAccountKey(request))
      return HttpResponse.json(
        { message: '로그인이 필요해요.' },
        { status: 401 },
      )
    const body = (await request.json().catch(() => null)) as {
      password?: string
    } | null
    if (body?.password !== 'pass1234')
      return HttpResponse.json(
        {
          code: 'WRONG_PASSWORD',
          message: '비밀번호가 맞지 않아요.',
          details: { field: 'password' },
        },
        { status: 400 },
      )
    return new HttpResponse(null, { status: 204 })
  }),
]
