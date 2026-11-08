import { beforeEach, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { login } from '../../../auth/api/authApi'
import { server } from '../../../mocks/server'
import {
  isOwnPlan,
  isStale,
  loadPlanned,
  type Planned,
  savePlanned,
  shortBasis,
  shortDate,
  currentCalculation,
} from './plannedQuantity'

const plan: Planned = {
  quantity: 60,
  source: 'SCENARIO_80',
  decidedAt: '2026-11-05',
  calculationRunId: 31,
}
beforeEach(async () => {
  localStorage.clear()
  await login({ email: 'seller@a.com', password: 'pass1234' })
})
it('계정 소유를 알 수 없는 예전 브라우저 저장은 읽거나 자동 업로드하지 않는다', async () => {
  localStorage.setItem('ipgo:planned-quantity', JSON.stringify({ '7': plan }))
  expect(await loadPlanned()).toEqual({})
})
it('서버에 저장하고 다시 읽으며 삭제 성공 후에만 사라진다', async () => {
  const saved = await savePlanned('7', plan)
  expect(saved).toMatchObject({
    quantity: 60,
    calculationRunId: 31,
    source: 'SCENARIO_80',
  })
  expect((await loadPlanned())['7']).toEqual(saved)
  await savePlanned('7', null)
  expect(await loadPlanned()).toEqual({})
})
it('저장 실패는 성공처럼 처리하지 않고 기존 수량을 유지한다', async () => {
  await savePlanned('7', plan)
  server.use(
    http.put('/api/products/7/planned-quantity', () =>
      HttpResponse.json({ message: '권한을 확인해 주세요.' }, { status: 403 }),
    ),
  )
  await expect(
    savePlanned('7', { ...plan, quantity: 120 }),
  ).rejects.toMatchObject({ status: 403 })
  expect((await loadPlanned())['7'].quantity).toBe(60)
})
it('조회 실패를 빈 목록으로 바꾸지 않는다', async () => {
  server.use(
    http.get('/api/planned-quantities', () =>
      HttpResponse.json({ message: '조회 실패' }, { status: 500 }),
    ),
  )
  await expect(loadPlanned()).rejects.toMatchObject({ status: 500 })
})
it('0·음수·소수·안전 범위 밖 숫자는 저장하지 않는다', async () => {
  for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    await expect(savePlanned('7', { ...plan, quantity })).rejects.toThrow()
  expect(await loadPlanned()).toEqual({})
})
it('같은 기준일의 새 계산도 runId로 구분하며 기준 없는 값은 확인이 필요하다', () => {
  expect(isStale(plan, 31)).toBe(false)
  expect(isStale(plan, 32)).toBe(true)
  expect(isStale({ ...plan, calculationRunId: null }, 31)).toBe(true)
  expect(isOwnPlan({ ...plan, source: 'SCENARIO_100' })).toBe(true)
  expect(shortBasis()).toBe('이전')
  expect(shortDate('2026-11-05')).toContain('11')
})
it('상세 결과와 D1의 동일 run을 확인하고 조회 중 바뀌면 저장 전 중단한다', async () => {
  let reads = 0
  server.use(
    http.get('/api/dashboard/replenishment-needs', () =>
      HttpResponse.json({
        runId: ++reads === 1 ? 31 : 32,
        asOfDate: '2026-11-05',
        items: [{ productId: 7, resultId: 101 }],
      }),
    ),
    http.get('/api/products/7/detail', () =>
      HttpResponse.json({
        asOfDate: '2026-11-05',
        result: { resultId: 101, status: 'OK' },
      }),
    ),
  )
  await expect(currentCalculation('7', 101)).rejects.toMatchObject({
    code: 'CALCULATION_CHANGED',
  })
  expect(await loadPlanned()).toEqual({})
})
