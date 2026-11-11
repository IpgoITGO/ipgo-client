import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type PropsWithChildren, useCallback, useEffect, useState } from 'react'

import { CalculationContext, type CalculationState } from './calculationContext'
import { cancelCalculationRun, getCalculationRun } from './calculationRunApi'
import {
  readTrackedRun,
  readTrackedUpload,
  type TrackedUpload,
  writeTrackedRun,
  writeTrackedUpload,
} from './calculationStorage'
import {
  getUploadResult,
  uploadFailureMessage,
} from '../../features/upload/model/uploadApi'

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
  const [upload, setUpload] = useState<TrackedUpload | null>(() =>
    readTrackedUpload(storageScope),
  )
  useEffect(() => {
    if (storageScope) writeTrackedUpload(storageScope, upload)
  }, [storageScope, upload])
  const uploadQuery = useQuery({
    queryKey: ['upload-result', upload?.uploadId],
    queryFn: () => getUploadResult(upload!.uploadId),
    enabled: upload !== null,
    staleTime: 0,
    retry: false,
    refetchInterval: (q) =>
      q.state.data && q.state.data.status !== 'PROCESSING'
        ? false
        : pollInterval,
  })
  const uploadStatus = uploadQuery.data?.status
  const uploadRunId = uploadQuery.data?.runId
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

  // 정제가 끝나 계산이 시작됐으면 계산 추적으로 넘기고, 확인 추적은 거둔다.
  if (upload !== null && uploadStatus === 'DONE') {
    trackRun(uploadRunId)
    setUpload(null)
  }

  let phase: CalculationState['phase'] = 'idle'
  let message: string | undefined
  if (upload !== null) {
    if (uploadStatus === 'FAILED') {
      phase = 'failed'
      message = uploadFailureMessage(uploadQuery.data?.error)
    } else if (uploadQuery.isError) {
      phase = 'failed'
      message = '수불부 처리 상태를 확인하지 못했어요.'
    } else phase = 'checking'
  } else if (runId !== null) {
    if (query.data?.status === 'FAILED') {
      phase = 'failed'
      // 서버 고정 문구 "계산을 완료하지 못했습니다. …"의 첫 문장은 제목과 같은 말이라 뺀다(작은 창 2줄)
      message =
        query.data.errorMessage
          ?.replace(/^계산을 \S+ 못했\S*\.\s*/, '')
          .trim() || '계산을 마치지 못했어요.'
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
  const busy = ['checking', 'pending', 'updating', 'unknown'].includes(phase)

  return (
    <CalculationContext.Provider
      value={{
        runId,
        phase,
        busy,
        run: query.data,
        message,
        checkingSince: phase === 'checking' ? upload?.startedAt : undefined,
        trackUpload: (id) => {
          if (!id) return
          setUpload((current) =>
            current?.uploadId === id
              ? current
              : { uploadId: id, startedAt: Date.now() },
          )
        },
        trackRun,
        retry,
        dismiss: () => {
          if (!busy) {
            setRunId(null)
            setUpload(null)
          }
        },
        stop: () => {
          if (upload !== null) return setUpload(null)
          if (runId === null) return
          // 로컬 중지는 서버 응답을 기다리지 않는다. 취소 대상보다 새 추적은 보존한다.
          setTimedOut(false)
          setRunId((current) => (current === runId ? null : current))
          // 취소 API가 없거나 실패해도 서버 계산 중지 성공으로 단정하지 않는다.
          // 이 응답은 현재/새 계산 추적 상태를 변경하지 않는다.
          void cancelCalculationRun(runId).catch(() => {})
        },
      }}
    >
      {children}
    </CalculationContext.Provider>
  )
}
