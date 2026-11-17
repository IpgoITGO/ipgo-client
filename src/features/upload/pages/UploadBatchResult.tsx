import { queryOptions, useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useCalculation } from '../../../shared/api/calculationContext'
import { Button } from '../../../shared/ui/Button/Button'
import { monthLabel } from '../model/uploadFormat'
import { getUploadResult, uploadFailureMessage } from '../model/uploadApi'
import { useUploadPeriods } from '../model/useUploadPeriods'
import styles from '../components/UploadHistory.module.css'
import { UploadProcessing } from './UploadProcessing'
import batchStyles from './UploadBatchResult.module.css'

export function UploadBatchResult({ uploadIds }: { uploadIds: string[] }) {
  const { trackUpload, trackRun } = useCalculation()
  const navigate = useNavigate()
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

  const orderedResults = results
    .map((result, index) => ({ result, uploadId: uploadIds[index] }))
    .sort(
      (a, b) =>
        Number(!b.result.isError && b.result.data?.status === 'FAILED') -
        Number(!a.result.isError && a.result.data?.status === 'FAILED'),
    )

  // 확인 중에는 한 파일을 올렸을 때와 같은 화면 한 장만 보여 준다(11/17: 제목·상태 줄·상자 안 상자가 겹쳐 로딩이 두 번 보였다)
  if (pending > 0 && unavailable === 0)
    return (
      <UploadProcessing
        onGoDashboard={() => navigate('/dashboard')}
        progress={{ completed: done + failed, total: uploadIds.length }}
      />
    )

  return (
    <section className={styles.history}>
      <h1>
        {finished
          ? '수불부 확인을 마쳤어요'
          : pending > 0
            ? '수불부 확인 중'
            : '수불부 확인 결과'}
      </h1>
      <p role="status" className={finished ? batchStyles.summary : undefined}>
        {uploadIds.length}개 중 {done}개 확인 · {failed}개 실패
        {pending > 0 && ` · ${pending}개 확인 중`}
        {unavailable > 0 && ` · ${unavailable}개 조회 실패`}
      </p>
      {pending > 0 && (
        <UploadProcessing
          progress={{ completed: done + failed, total: uploadIds.length }}
          onGoDashboard={() => navigate('/dashboard')}
        />
      )}
      {finished && failed === 0 && (
        <p className={batchStyles.success}>모두 확인했어요</p>
      )}
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
        <p>
          확인 못 한 달이 있어요. 아래에서 이유를 보고 그 달만 다시 올려 주세요.
        </p>
      )}
      {pending === 0 && (
        <ul className={styles.list}>
          {orderedResults.map(({ result, uploadId }) => {
            const data = result.data
            const period = periods.data?.items.find(
              (item) => String(item.uploadId) === uploadId,
            )
            const label = monthLabel(data?.periodStart ?? period?.period ?? '')
            const failure = !result.isError && data?.status === 'FAILED'
            const closed = data?.error?.code === 'LEGACY_UPLOAD_CLOSED'
            return (
              <li className={styles.row} key={uploadId}>
                <div>
                  <strong>{label}</strong>
                  <p className={styles.filename}>
                    {period?.fileName ?? `업로드 ${uploadId}`}
                  </p>
                  <p>
                    {result.isError
                      ? '결과를 불러오지 못했어요'
                      : data?.status === 'DONE'
                        ? '✅ 확인 완료'
                        : failure
                          ? closed
                            ? '과거 기록 마감'
                            : '❌ 확인 실패'
                          : '확인 중'}
                  </p>
                  {failure && (
                    <p className={styles.failure}>
                      {uploadFailureMessage(data.error)}
                    </p>
                  )}
                </div>
                <div className={styles.actions}>
                  {result.isError ? (
                    <Button
                      onClick={() => void result.refetch()}
                      variant="secondary"
                    >
                      결과 다시 확인
                    </Button>
                  ) : (
                    <Link to={`/upload/${uploadId}/result`}>결과 보기</Link>
                  )}
                  {failure && !closed && (
                    <Link
                      aria-label={`${label} 다시 올리기`}
                      to={`/upload?retry=${encodeURIComponent(data.periodStart?.slice(0, 7) ?? period?.period ?? '')}`}
                    >
                      다시 올리기
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {pending === 0 && <Link to="/dashboard">대시보드로 가기</Link>}
    </section>
  )
}
