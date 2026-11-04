import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../../mocks/server'
import {
  cancelPlannedReceipt,
  updatePlannedReceipt,
} from './plannedReceiptsApi'

describe('발주 변경 계산 번호', () => {
  it('PATCH 응답 헤더에서 실제 계산 번호를 읽는다', async () => {
    server.use(
      http.patch('/api/planned-receipts/1', () =>
        HttpResponse.json(
          { receiptId: 1 },
          {
            headers: { 'X-Calculation-Run-Id': '72' },
          },
        ),
      ),
    )
    await expect(
      updatePlannedReceipt(1, { quantity: 10, expectedOn: null }),
    ).resolves.toEqual({ runId: 72 })
  })
  it('DELETE의 204 응답 본문 없이 계산 번호를 읽는다', async () => {
    server.use(
      http.delete(
        '/api/planned-receipts/1',
        () =>
          new HttpResponse(null, {
            status: 204,
            headers: { 'X-Calculation-Run-Id': '73' },
          }),
      ),
    )
    await expect(cancelPlannedReceipt(1)).resolves.toEqual({ runId: 73 })
  })
  it('계산이 없는 204는 가짜 번호를 만들지 않는다', async () => {
    server.use(
      http.delete(
        '/api/planned-receipts/1',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    await expect(cancelPlannedReceipt(1)).resolves.toEqual({ runId: null })
  })
})
