import { http, HttpResponse } from 'msw'

import { mockAccountKey } from '../../../auth/mocks/handlers'
import { PASSWORD_RULE } from '../../../auth/model/passwordRule'

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
  // server #194: 로그인한 채로 비밀번호 바꾸기. 지금 비밀번호가 'pass1234'(시험 계정)여야 204
  http.post('/api/account/password', async ({ request }) => {
    if (!mockAccountKey(request))
      return HttpResponse.json(
        { message: '로그인이 필요해요.' },
        { status: 401 },
      )
    const body = (await request.json().catch(() => null)) as {
      currentPassword?: string
      newPassword?: string
    } | null
    if (body?.currentPassword !== 'pass1234')
      return HttpResponse.json(
        {
          code: 'WRONG_PASSWORD',
          message: '비밀번호가 맞지 않아요.',
          details: { field: 'currentPassword' },
        },
        { status: 400 },
      )
    if (!PASSWORD_RULE.test(body?.newPassword ?? ''))
      return HttpResponse.json(
        {
          code: 'INVALID_INPUT',
          message: '비밀번호 규칙을 확인해 주세요.',
          details: { field: 'newPassword' },
        },
        { status: 400 },
      )
    return new HttpResponse(null, { status: 204 })
  }),
]
