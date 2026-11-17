import { queryOptions, useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { useCalculation } from '../../../shared/api/calculationContext'
import { Button } from '../../../shared/ui/Button/Button'
import { monthLabel, monthOrNone } from '../model/uploadFormat'
import { getUploadResult, uploadFailureMessage } from '../model/uploadApi'
import { useUploadPeriods } from '../model/useUploadPeriods'
import { type CheckFile, UploadProcessing } from './UploadProcessing'
import batchStyles from './UploadBatchResult.module.css'

export function UploadBatchResult({
  uploadIds,
  failedUploads = [],
}: {
  uploadIds: string[]
  failedUploads?: Array<{ name: string; reason: string }>
}) {
  const { trackUpload, trackRun } = useCalculation()
  const location = useLocation()
  const [startedAt] = useState(() => {
    const value: unknown = location.state?.uploadStartedAt
    return typeof value === 'number' &&
      Number.isFinite(value) &&
      value > 0 &&
      value <= Date.now()
      ? value
      : Date.now()
  })
  const batchId = uploadIds.join(',')
  // 업로드 화면이 넘겨 준 올린 이름(없으면 서버 목록의 이름)
  const names = (location.state as { names?: Record<string, string> } | null)
    ?.names
  const queryClient = useQueryClient()
  const periods = useUploadPeriods()
  const results = useQueries({
    queries: uploadIds.map((id) =>
      queryOptions({
        queryKey: ['upload-result', id],
        queryFn: () => getUploadResult(id),
        refetchInterval: (query) =>
          query.state.data?.status === 'PROCESSING' ? 2000 : false,
      }),
    ),
  })
  const done = results.filter(
    (result) => !result.isError && result.data?.status === 'DONE',
  ).length
  const failed = results.filter(
    (result) => !result.isError && result.data?.status === 'FAILED',
  ).length
  const unavailable = results.filter((result) => result.isError).length
  const pending = uploadIds.length - done - failed - unavailable
  const activeId = uploadIds.find(
    (_, index) => results[index].data?.status === 'PROCESSING',
  )
  const finished = pending === 0 && unavailable === 0
  const latestRun = finished
    ? results.filter((result) => result.data?.status === 'DONE').at(-1)?.data
        ?.runId
    : null

  useEffect(() => {
    if (activeId)
      trackUpload(activeId, {
        id: batchId,
        startedAt,
        completed: done + failed,
        total: uploadIds.length,
      })
  }, [
    activeId,
    batchId,
    startedAt,
    done,
    failed,
    uploadIds.length,
    trackUpload,
  ])
  useEffect(() => {
    if (latestRun) trackRun(latestRun)
  }, [latestRun, trackRun])
  useEffect(() => {
    if (!finished) return
    void queryClient.invalidateQueries({ queryKey: ['upload-periods'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }, [finished, queryClient])

  // 확인 화면의 파일 줄: 이름은 올린 그대로, 달은 서버가 알아냈을 때만 붙인다.
  // 서버 상태에는 "차례 기다림"이 따로 없어서, 아직 안 끝난 것 중 맨 앞 하나만 "확인 중"으로 보인다.
  const firstOpen = uploadIds.find(
    (_, index) =>
      !results[index].isError &&
      results[index].data?.status !== 'DONE' &&
      results[index].data?.status !== 'FAILED',
  )
  const checkFiles: CheckFile[] = uploadIds.map((uploadId, index) => {
    const data = results[index].data
    const period = periods.data?.items.find(
      (item) => String(item.uploadId) === uploadId,
    )
    return {
      id: uploadId,
      name: names?.[uploadId] ?? period?.fileName ?? `수불부 ${index + 1}`,
      month: monthOrNone(data?.periodStart ?? period?.period),
      state:
        data?.status === 'DONE'
          ? 'done'
          : data?.status === 'FAILED'
            ? 'failed'
            : uploadId === firstOpen
              ? 'now'
              : 'wait',
    }
  })

  const orderedResults = results
    .map((result, index) => ({ result, uploadId: uploadIds[index] }))
    .sort(
      (a, b) =>
        Number(!b.result.isError && b.result.data?.status === 'FAILED') -
        Number(!a.result.isError && a.result.data?.status === 'FAILED'),
    )

  // 확인 중에는 한 파일을 올렸을 때와 같은 화면 한 장만 보여 준다(11/17: 제목·상태 줄·상자 안 상자가 겹쳐 로딩이 두 번 보였다)
  if (pending > 0 && unavailable === 0)
    return <UploadProcessing files={checkFiles} />

  return (
    <section className={batchStyles.page}>
      <h1>
        {finished
          ? '수불부 확인을 마쳤어요'
          : pending > 0
            ? '수불부 확인 중'
            : '수불부 확인 결과'}
      </h1>
      {/* 요약은 제목 아래 한 줄(11/17: 제목만 한 큰 글씨 두 줄이 겹쳐 보였다) */}
      <div className={batchStyles.sum}>
        <p role="status">
          {uploadIds.length}개 중 {done}개 확인 · {failed}개 실패
          {pending > 0 && ` · ${pending}개 확인 중`}
          {unavailable > 0 && ` · ${unavailable}개 조회 실패`}
        </p>
        {finished && failed === 0 && failedUploads.length === 0 && (
          <p className={batchStyles.success}>모두 확인했어요</p>
        )}
      </div>
      {pending > 0 && <UploadProcessing files={checkFiles} />}
      {unavailable > 0 && (
        <p role="alert">
          일부 파일의 결과를 불러오지 못했어요. 조회 실패는 확인 완료나 정제
          실패로 세지 않아요.
        </p>
      )}
      {pending > 0 && unavailable > 0 && (
        <Button
          onClick={() => {
            for (const result of results)
              if (result.isError) void result.refetch()
          }}
          variant="secondary"
        >
          조회 실패 다시 확인
        </Button>
      )}
      {pending === 0 && failed > 0 && (
        <p className={batchStyles.note}>
          확인 못 한 달이 있어요. 아래에서 이유를 보고 그 달만 다시 올려 주세요.
        </p>
      )}
      {/* 확인 중 화면의 파일 줄과 같은 모양: 표시 | 달 | 파일 이름 | 상태 | 결과 보기. 못 한 줄만 아래에 이유가 붙는다 */}
      {pending === 0 && (
        <ul className={batchStyles.list}>
          {orderedResults.map(({ result, uploadId }) => {
            const data = result.data
            const period = periods.data?.items.find(
              (item) => String(item.uploadId) === uploadId,
            )
            const start = data?.periodStart ?? period?.period ?? ''
            const label = monthLabel(start)
            const month = monthOrNone(start)
            const name =
              names?.[uploadId] ?? period?.fileName ?? `업로드 ${uploadId}`
            const failure = !result.isError && data?.status === 'FAILED'
            const closed = data?.error?.code === 'LEGACY_UPLOAD_CLOSED'
            return (
              <li
                data-state={
                  result.isError
                    ? 'unknown'
                    : data?.status === 'DONE'
                      ? 'done'
                      : failure
                        ? 'failed'
                        : 'wait'
                }
                key={uploadId}
              >
                <i aria-hidden="true" />
                {month && <strong>{month}</strong>}
                <span className={batchStyles.name} title={name}>
                  {name}
                </span>
                <em>
                  {result.isError
                    ? '결과를 불러오지 못했어요'
                    : data?.status === 'DONE'
                      ? '확인 완료'
                      : failure
                        ? closed
                          ? '과거 기록 마감'
                          : '확인 실패'
                        : '확인 중'}
                </em>
                <span className={batchStyles.actions}>
                  {result.isError ? (
                    <Button
                      onClick={() => void result.refetch()}
                      variant="text"
                    >
                      결과 다시 확인
                    </Button>
                  ) : (
                    <Link to={`/upload/${uploadId}/result`}>결과 보기</Link>
                  )}
                  {failure && !closed && (
                    <Link
                      aria-label={`${label} 다시 올리기`}
                      className={batchStyles.retry}
                      to={`/upload?retry=${encodeURIComponent(data.periodStart?.slice(0, 7) ?? period?.period ?? '')}`}
                    >
                      다시 올리기
                    </Link>
                  )}
                </span>
                {failure && (
                  <p className={batchStyles.reason}>
                    {uploadFailureMessage(data.error)}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {pending === 0 && failedUploads.length > 0 && (
        <section aria-label="업로드 못 한 파일" className={batchStyles.missed}>
          <h2>업로드 못 한 파일 {failedUploads.length}개</h2>
          <ul>
            {failedUploads.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <strong>{file.name}</strong> · {file.reason}
              </li>
            ))}
          </ul>
          <Link to="/upload">못 올린 파일 다시 고르기</Link>
        </section>
      )}
      {pending === 0 && (
        <Link className={batchStyles.go} to="/dashboard">
          대시보드로 가기
        </Link>
      )}
    </section>
  )
}
