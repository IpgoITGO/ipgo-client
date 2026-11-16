import { monthLabel } from '../model/uploadFormat'
import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { Button } from '../../../shared/ui/Button/Button'
import {
  getUploadResult,
  type UploadedPeriod,
  uploadFailureMessage,
} from '../model/uploadApi'
import { useUploadPeriods } from '../model/useUploadPeriods'
import styles from './UploadHistory.module.css'

export function UploadHistory() {
  const periods = useUploadPeriods()
  // Server231 적용 전 응답은 실패한 항목만 기존 U2로 보완한다.
  const failures =
    periods.data?.items.filter(
      (item) => item.status === 'FAILED' && !item.error,
    ) ?? []
  const details = useQueries({
    queries: failures.map((item) => ({
      queryKey: ['upload-result', String(item.uploadId)],
      queryFn: () => getUploadResult(String(item.uploadId)),
    })),
  })

  if (periods.isPending)
    return <p role="status">업로드 내역을 불러오고 있어요.</p>
  if (periods.isError)
    return (
      <section aria-label="업로드 내역">
        <p role="alert">업로드 내역을 불러오지 못했어요.</p>
        <Button onClick={() => void periods.refetch()} variant="secondary">
          내역 다시 확인
        </Button>
      </section>
    )
  if (periods.data.items.length === 0) return null

  const items = periods.data.items.map((item) => {
    const detail =
      details[
        failures.findIndex((failure) => failure.uploadId === item.uploadId)
      ]
    return { ...item, error: item.error ?? detail?.data?.error }
  })
  const failed = items.filter((item) => item.status === 'FAILED')
  const processing = items.filter(
    (item) => item.status !== 'FAILED' && item.status !== 'DONE',
  )
  const done = items.filter((item) => item.status === 'DONE')
  const doneByYear = new Map<string, UploadedPeriod[]>()
  for (const item of done) {
    const year = item.period.slice(0, 4)
    const group = doneByYear.get(year) ?? []
    group.push(item)
    doneByYear.set(year, group)
  }
  const rows = (group: UploadedPeriod[]) => (
    <ul className={styles.list}>
      {group.map((item) => (
        <UploadHistoryRow key={item.uploadId} item={item} />
      ))}
    </ul>
  )

  return (
    <section aria-label="업로드 내역" className={styles.history}>
      <h2>업로드 내역</h2>
      <p role="status">
        {items.length}개 중 {done.length}개 확인 · {failed.length}개 실패
        {processing.length > 0 && ` · ${processing.length}개 확인 중`}
      </p>
      {failed.length > 0 && (
        <section aria-label="실패한 달">
          <h3>실패한 달</h3>
          {rows(failed)}
        </section>
      )}
      {processing.length > 0 && (
        <section aria-label="확인 중인 달">
          <h3>확인 중인 달</h3>
          {rows(processing)}
        </section>
      )}
      {[...doneByYear]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([year, group]) => (
          <details key={year}>
            <summary>
              {year}년 확인한 달 {group.length}개
            </summary>
            {rows(group)}
          </details>
        ))}
    </section>
  )
}

function UploadHistoryRow({ item }: { item: UploadedPeriod }) {
  const failed = item.status === 'FAILED'
  const closed = item.error?.code === 'LEGACY_UPLOAD_CLOSED'
  return (
    <li className={styles.row}>
      <div>
        <strong>{monthLabel(item.period)}</strong>
        <p className={styles.filename}>{item.fileName}</p>
        <p>
          <span aria-hidden="true">
            {failed ? '❌' : item.status === 'DONE' ? '✅' : '◷'}
          </span>{' '}
          {failed
            ? closed
              ? '과거 기록 마감'
              : '확인 실패'
            : item.status === 'DONE'
              ? '확인 완료'
              : '확인 중'}
        </p>
        {failed && (
          <p className={styles.failure}>
            {uploadFailureMessage(
              item.error,
              '확인하지 못했어요. 결과에서 자세한 내용을 확인해 주세요.',
            )}
          </p>
        )}
      </div>
      <div className={styles.actions}>
        <Link to={`/upload/${item.uploadId}/result`}>결과 보기</Link>
        {failed && !closed && (
          <Link
            to={`/upload?retry=${encodeURIComponent(item.period)}`}
            aria-label={`${monthLabel(item.period)} 다시 올리기`}
          >
            다시 올리기
          </Link>
        )}
      </div>
    </li>
  )
}

export function FailedUploadsNotice() {
  const periods = useUploadPeriods()
  const failures =
    periods.data?.items.filter(
      (item) =>
        item.status === 'FAILED' && item.error?.code !== 'LEGACY_UPLOAD_CLOSED',
    ) ?? []
  if (periods.isError)
    return (
      <p role="alert">
        월별 업로드 상태를 확인하지 못했어요.{' '}
        <Link to="/upload">업로드 내역 확인</Link>
      </p>
    )
  if (failures.length === 0) return null
  return (
    <aside role="status" className={styles.notice}>
      <strong>확인 못 한 달이 있어요</strong>
      <p>
        {failures.map((item) => monthLabel(item.period)).join(', ')} · 이 달의
        새 파일은 계산에 반영되지 않았어요.
      </p>
      <Link to="/upload">실패 이유 확인하고 다시 올리기</Link>
    </aside>
  )
}
