import { http, HttpResponse } from 'msw'
import { mockAccountKey } from '../../../auth/mocks/handlers'
// 기본 시험 화면에는 실제 확정처럼 보일 검토 자료를 자동 생성하지 않는다.
// 계약 회귀는 각 테스트가 명시적으로 제공한 합성 응답만 사용한다.
export const receiptHandlers = [
  http.get('/api/receipt-corrections', ({ request }) =>
    mockAccountKey(request)
      ? HttpResponse.json({ items: [], nextCursor: null })
      : HttpResponse.json({ message: '로그인이 필요해요.' }, { status: 401 }),
  ),
  http.get('/api/receipt-corrections/:id', () =>
    HttpResponse.json({ message: '검토 자료가 없어요.' }, { status: 404 }),
  ),
]
