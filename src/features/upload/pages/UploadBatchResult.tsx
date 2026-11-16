import { queryOptions, useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import { useCalculation } from '../../../shared/api/calculationContext'
import { Button } from '../../../shared/ui/Button/Button'
import { monthLabel } from '../model/uploadFormat'
import { getUploadResult, uploadFailureMessage } from '../model/uploadApi'
import { useUploadPeriods } from '../model/useUploadPeriods'
import styles from '../components/UploadHistory.module.css'

export function UploadBatchResult({ uploadIds }: { uploadIds: string[] }) {
  const { trackUpload, trackRun } = useCalculation()
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
  const latestRun =
    pending === 0
      ? results.filter((result) => result.data?.status === 'DONE').at(-1)?.data
          ?.runId
      : null

  useEffect(() => {
    if (activeId) trackUpload(activeId)
  }, [activeId, trackUpload])
  useEffect(() => {
    if (latestRun) trackRun(latestRun)
  }, [latestRun, trackRun])
  const finished = pending === 0 && unavailable === 0
  useEffect(() => {
    if (!finished) return
    void queryClient.invalidateQueries({ queryKey: ['upload-periods'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }, [finished, queryClient])

  return (
    <section className={styles.history}>
      <h1>수불부 확인 결과</h1>
      <p role="status">
        {uploadIds.length}개 중 {done}개 확인 · {failed}개 실패
        {pending > 0 && ` · ${pending}개 확인 중`}
        {unavailable > 0 && ` · ${unavailable}개 조회 실패`}
      </p>
      {failed > 0 && (
        <p>
          확인 못 한 달이 있어요. 아래에서 이유를 보고 그 달만 다시 올려 주세요.
        </p>
      )}
      <ul className={styles.list}>
        {results.map((result, index) => {
          const data = result.data
          const period = periods.data?.items.find(
            (item) => String(item.uploadId) === uploadIds[index],
          )
          const label = monthLabel(data?.periodStart ?? period?.period ?? '')
          const failure = data?.status === 'FAILED'
          const closed = data?.error?.code === 'LEGACY_UPLOAD_CLOSED'
          return (
            <li className={styles.row} key={uploadIds[index]}>
              <div>
                <strong>{label}</strong>
                <p className={styles.filename}>
                  {period?.fileName ?? `업로드 ${uploadIds[index]}`}
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
                  <Link to={`/upload/${uploadIds[index]}/result`}>
                    결과 보기
                  </Link>
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
      <Link to="/dashboard">대시보드로</Link>
    </section>
  )
}
