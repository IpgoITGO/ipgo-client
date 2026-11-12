import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../../mocks/server'
import { getProductSettings } from './inboundSettingsApi'

describe('상품 목록', () => {
  it('서버가 100개씩 줘도 전체(total)를 다 받을 때까지 쪽을 넘긴다', async () => {
    const pages: number[] = []
    server.use(
      http.get('/api/products', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        pages.push(page)
        const count = page === 0 ? 100 : 50
        return HttpResponse.json({
          items: Array.from({ length: count }, (_, i) => ({
            productId: page * 100 + i,
          })),
          total: 150,
          page,
          size: 100,
        })
      }),
    )
    const result = await getProductSettings()
    expect(pages).toEqual([0, 1])
    expect(result.items).toHaveLength(150)
    expect(result.total).toBe(150)
  })
})
