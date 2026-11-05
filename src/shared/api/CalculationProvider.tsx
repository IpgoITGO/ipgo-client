import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type PropsWithChildren, useCallback, useEffect, useState } from 'react'

import { CalculationContext, type CalculationState } from './calculationContext'
import { cancelCalculationRun, getCalculationRun } from './calculationRunApi'
import { readTrackedRun, writeTrackedRun } from './calculationStorage'

// 정제/계산을 재실행하지 않고 같은 C2만 조회한다. 확인 시간 초과는 계산 실패가 아니다.
export function CalculationProvider({
  children,
  pollInterval = 2000,
  timeout = 300_000,
  storageScope,
}: PropsWithChildren<{
  pollInterval?: number
  timeout?: number
  storageScope?: string
}>) {
  const client = useQueryClient()
  const [runId, setRunId] = useState<number | null>(() =>
    readTrackedRun(storageScope),
  )
  useEffect(() => {
    if (storageScope) writeTrackedRun(storageScope, runId)
  }, [storageScope, runId])
  const [timedOut, setTimedOut] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [refresh, setRefresh] = useState<{ id: number | null; error: boolean }>(
    {
      id: null,
      error: false,
    },
  )
  const query = useQuery({
    queryKey: ['calculation-run', runId],
    queryFn: () => getCalculationRun(runId!),
    enabled: runId !== null && !timedOut,
    staleTime: 0,
    retry: false,
    refetchInterval: (q) =>
      q.state.error ||
      timedOut ||
      ['DONE', 'FAILED', 'CANCELED'].includes(q.state.data?.status ?? '')
        ? false
        : pollInterval,
  })
  const pending =
    runId !== null &&
    !['DONE', 'FAILED', 'CANCELED'].includes(query.data?.status ?? '')

  useEffect(() => {
    if (!pending || query.isError) return
    const timer = setTimeout(() => setTimedOut(true), timeout)
    return () => clearTimeout(timer)
  }, [runId, pending, query.isError, attempt, timeout])

  const refreshResults = useCallback(
    () =>
      client.invalidateQueries(
        {
          predicate: (q) =>
            [
              'dashboard',
              'sku',
              'result',
              'products',
              'planned-receipts',
            ].includes(String(q.queryKey[0])),
        },
        { throwOnError: true },
      ),
    [client],
  )

  useEffect(() => {
    if (runId === null || query.data?.status !== 'DONE') return
    let cancelled = false
    void refreshResults().then(
      () => {
        if (!cancelled) setRefresh({ id: runId, error: false })
      },
      () => {
        if (!cancelled) setRefresh({ id: runId, error: true })
      },
    )
    return () => {
      cancelled = true
    }
  }, [runId, query.data?.status, refreshResults])

  const trackRun = useCallback((id: number | null | undefined) => {
    if (!Number.isSafeInteger(id) || !id || id < 1) return
    setRunId((current) => (current === null ? id : Math.max(current, id)))
    setTimedOut(false)
  }, [])

  let phase: CalculationState['phase'] = 'idle'
  let message: string | undefined
  if (runId !== null) {
    if (query.data?.status === 'FAILED') {
      phase = 'failed'
      message = query.data.errorMessage ?? '계산을 마치지 못했어요.'
    } else if (query.data?.status === 'CANCELED') {
      phase = 'failed'
      message = '계산을 멈췄어요. 이전 결과는 그대로예요.'
    } else if (query.data?.status === 'DONE') {
      phase =
        refresh.id !== runId ? 'updating' : refresh.error ? 'unknown' : 'done'
      if (refresh.error)
        message = '계산은 끝났지만 새 결과를 불러오지 못했어요.'
    } else if (query.isError || timedOut) {
      phase = 'unknown'
      message = timedOut
        ? '계산 결과를 확인하는 데 시간이 걸리고 있어요.'
        : '계산 상태를 확인하지 못했어요.'
    } else phase = 'pending'
  }
  const retry = () => {
    if (query.data?.status === 'DONE' && runId !== null) {
      void refreshResults().then(
        () => setRefresh({ id: runId, error: false }),
        () => setRefresh({ id: runId, error: true }),
      )
    } else {
      setTimedOut(false)
      setAttempt((value) => value + 1)
      void query.refetch()
    }
  }
  const busy = ['pending', 'updating', 'unknown'].includes(phase)

  return (
    <CalculationContext.Provider
      value={{
        runId,
        phase,
        busy,
        run: query.data,
        message,
        trackRun,
        retry,
        dismiss: () => {
          if (!busy) setRunId(null)
        },
        stop: async () => {
          if (runId === null) return
          try {
            await cancelCalculationRun(runId)
          } catch {
            // 취소 요청이 실패해도 화면은 기다리기를 그만둔다(서버 계산은 서버가 정리)
          }
          setTimedOut(false)
          setRunId(null)
        },
      }}
    >
      {children}
    </CalculationContext.Provider>
  )
}
