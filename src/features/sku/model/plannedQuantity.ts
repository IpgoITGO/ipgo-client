import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../auth/model/useAuth'
import { ApiError, apiRequest } from '../../../shared/api/client'
import { shortDate } from '../../../shared/lib/elapsed'
import type { ReplenishmentNeeds } from '../../dashboard/model/dashboardApi'
export { shortDate }

export type PlannedSource =
  'SCENARIO_80' | 'SCENARIO_100' | 'SCENARIO_120' | 'MANUAL'
export type Planned = {
  quantity: number
  source: PlannedSource
  decidedAt: string
  calculationRunId: number | null
  basis?: string
}
type Item = Planned & { productId: number }
const EMPTY: Record<string, Planned> = {}
const key = (owner: string | undefined) =>
  ['planned-quantities', owner] as const

export async function loadPlanned(
  signal?: AbortSignal,
): Promise<Record<string, Planned>> {
  const response = await apiRequest<{ items: Item[] }>('/planned-quantities', {
    signal,
  })
  return Object.fromEntries(
    response.items.map(({ productId, ...plan }) => [String(productId), plan]),
  )
}

export async function savePlanned(productId: string, plan: Planned | null) {
  const path = `/products/${encodeURIComponent(productId)}/planned-quantity`
  if (!plan) {
    await apiRequest<void>(path, { method: 'DELETE' })
    return null
  }
  if (!Number.isSafeInteger(plan.quantity) || plan.quantity <= 0)
    throw new Error('입고량은 1개 이상의 정수로 입력해 주세요.')
  const item = await apiRequest<Item>(path, {
    method: 'PUT',
    body: JSON.stringify({
      quantity: plan.quantity,
      source: plan.source,
      calculationRunId: plan.calculationRunId,
    }),
  })
  return {
    quantity: item.quantity,
    source: item.source,
    calculationRunId: item.calculationRunId,
    decidedAt: item.decidedAt,
  }
}

// K1에는 runId가 없다. D1을 전후로 읽어 동일 run의 실제 K1 결과임을 확인한다.
// 같은 기준일에 재계산해도 날짜로 runId를 추측하지 않는다.
export async function currentCalculation(
  productId: string,
  resultId: string | number,
) {
  const first = await apiRequest<ReplenishmentNeeds>(
    '/dashboard/replenishment-needs',
  )
  const detail = await apiRequest<{
    result: { resultId: number; status: string } | null
    asOfDate: string | null
  }>(`/products/${encodeURIComponent(productId)}/detail`)
  const last = await apiRequest<ReplenishmentNeeds>(
    '/dashboard/replenishment-needs',
  )
  const needed = last.items.some(
    (item) =>
      item.productId === Number(productId) &&
      item.resultId === Number(resultId),
  )
  const safe =
    last.notNeededItems?.some((item) => item.productId === Number(productId)) &&
    detail.result?.status === 'NOT_NEEDED'
  if (
    !last.runId ||
    first.runId !== last.runId ||
    detail.result?.resultId !== Number(resultId) ||
    detail.asOfDate !== last.asOfDate ||
    (!needed && !safe)
  ) {
    throw new ApiError(
      409,
      'CALCULATION_CHANGED',
      '계산 결과가 바뀌었어요. 상품 화면을 새로고침한 뒤 다시 정해 주세요.',
    )
  }
  return last.runId
}

export function usePlannedQuery() {
  const { user, status } = useAuth()
  return useQuery({
    queryKey: key(user?.email),
    queryFn: ({ signal }) => loadPlanned(signal),
    enabled: status === 'authenticated',
    staleTime: 0,
  })
}
export function usePlanned() {
  return usePlannedQuery().data ?? EMPTY
}
export function usePlannedMutation(
  productId: string,
  resultId: string | number,
) {
  const { user } = useAuth()
  const client = useQueryClient()
  const inFlight = useRef(false)
  type Draft = { quantity: number; source: PlannedSource } | null
  const mutation = useMutation({
    mutationFn: async ({
      draft,
    }: {
      draft: Draft
      owner: string | undefined
    }) =>
      savePlanned(
        productId,
        draft
          ? {
              ...draft,
              decidedAt: '',
              calculationRunId: await currentCalculation(productId, resultId),
            }
          : null,
      ),
    onSuccess: (saved, { owner }) => {
      client.setQueryData<Record<string, Planned>>(key(owner), (old) => {
        const next = { ...old }
        if (saved) next[productId] = saved
        else delete next[productId]
        return next
      })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'CALCULATION_CHANGED') {
        void client.invalidateQueries({ queryKey: ['sku', productId] })
        void client.invalidateQueries({ queryKey: ['dashboard'] })
      }
    },
    onSettled: (_data, _error, { owner }) => {
      void client.invalidateQueries({ queryKey: key(owner) })
    },
  })
  return {
    ...mutation,
    mutate: (draft: Draft) => {
      if (inFlight.current) return
      inFlight.current = true
      mutation.mutate(
        { draft, owner: user?.email },
        {
          onSettled: () => {
            inFlight.current = false
          },
        },
      )
    },
  }
}
// 100%도 명시적으로 정한 수량이다. 다음 계산에서 새 권장량으로 몰래 대체하지 않는다.
export const isOwnPlan = (plan?: Planned): plan is Planned => !!plan
export const isStale = (plan: Planned, currentRun: number | null | undefined) =>
  plan.calculationRunId == null ||
  currentRun == null ||
  plan.calculationRunId !== currentRun
export const shortBasis = (basis?: string) =>
  basis ? shortDate(basis) : '이전'
