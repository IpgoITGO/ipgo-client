import { http, HttpResponse } from 'msw'
import { mockAccountKey } from '../../../auth/mocks/handlers'
import type { Planned } from '../model/plannedQuantity'
const plans = new Map<string, Map<number, Planned>>()
export function resetPlannedQuantitiesMock() {
  plans.clear()
}
function store(request: Request) {
  const owner = mockAccountKey(request)
  if (!owner) return null
  if (!plans.has(owner)) plans.set(owner, new Map())
  return plans.get(owner)!
}
const unauthorized = () =>
  HttpResponse.json(
    { code: 'UNAUTHENTICATED', message: '로그인이 필요해요.' },
    { status: 401 },
  )
export const plannedQuantityHandlers = [
  http.get('/api/planned-quantities', ({ request }) => {
    const data = store(request)
    return data
      ? HttpResponse.json({
          items: [...data].map(([productId, p]) => ({ productId, ...p })),
        })
      : unauthorized()
  }),
  http.put(
    '/api/products/:id/planned-quantity',
    async ({ params, request }) => {
      const data = store(request)
      if (!data) return unauthorized()
      const body = (await request.json()) as Omit<Planned, 'decidedAt'>
      if (!Number.isSafeInteger(body.quantity) || body.quantity <= 0)
        return HttpResponse.json(
          { message: '입고량을 확인해 주세요.' },
          { status: 400 },
        )
      const plan = { ...body, decidedAt: new Date().toISOString() }
      data.set(Number(params.id), plan)
      return HttpResponse.json({ productId: Number(params.id), ...plan })
    },
  ),
  http.delete('/api/products/:id/planned-quantity', ({ params, request }) => {
    const data = store(request)
    if (!data) return unauthorized()
    data.delete(Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),
]
