import { http, HttpResponse } from 'msw'
import { mockAccountKey } from '../../../auth/mocks/handlers'
import type { Box } from '../model/storageCost'

// server #132와 같은 모양: 계정마다 요율 하나 + 상품별 상자
type Store = { ratePerCbm: number | null; boxes: Map<number, Box> }
const stores = new Map<string, Store>()
export function resetStorageCostMock() {
  stores.clear()
}
function store(request: Request) {
  const owner = mockAccountKey(request)
  if (!owner) return null
  if (!stores.has(owner))
    stores.set(owner, { ratePerCbm: null, boxes: new Map() })
  return stores.get(owner)!
}
const unauthorized = () =>
  HttpResponse.json(
    { code: 'UNAUTHENTICATED', message: '로그인이 필요해요.' },
    { status: 401 },
  )
const invalid = (field: string) =>
  HttpResponse.json(
    {
      code: 'INVALID_INPUT',
      message: '값을 확인해 주세요.',
      details: { field },
    },
    { status: 400 },
  )
const positive = (value: unknown) => typeof value === 'number' && value > 0

export const storageCostHandlers = [
  http.get('/api/settings/storage-cost', ({ request }) => {
    const data = store(request)
    if (!data) return unauthorized()
    return HttpResponse.json({
      ratePerCbm: data.ratePerCbm,
      boxes: [...data.boxes].map(([productId, box]) => ({ productId, ...box })),
    })
  }),
  http.put('/api/settings/storage-cost', async ({ request }) => {
    const data = store(request)
    if (!data) return unauthorized()
    const { ratePerCbm } = (await request.json()) as { ratePerCbm: unknown }
    if (ratePerCbm !== null && !positive(ratePerCbm))
      return invalid('ratePerCbm')
    data.ratePerCbm = ratePerCbm as number | null
    return HttpResponse.json({ ratePerCbm: data.ratePerCbm })
  }),
  http.put('/api/products/:id/box', async ({ params, request }) => {
    const data = store(request)
    if (!data) return unauthorized()
    const box = (await request.json()) as Box
    for (const side of ['width', 'depth', 'height'] as const)
      if (!positive(box[side])) return invalid(side)
    data.boxes.set(Number(params.id), box)
    return HttpResponse.json({ productId: Number(params.id), ...box })
  }),
  http.delete('/api/products/:id/box', ({ params, request }) => {
    const data = store(request)
    if (!data) return unauthorized()
    data.boxes.delete(Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),
]
