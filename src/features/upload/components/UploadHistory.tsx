import { monthLabel } from '../model/uploadFormat'
import { useQueries } from '@tanstack/react-query'
import { type CSSProperties, useState } from 'react'
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
  // 마우스나 포커스가 올라간 달(YYYY-MM)
  const [peek, setPeek] = useState<string | null>(null)
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
  // 달마다 한 칸. 같은 달이 둘이면 먼저 온(최신) 것을 쓴다
  const byPeriod = new Map<string, UploadedPeriod>()
  for (const item of items)
    if (!byPeriod.has(item.period)) byPeriod.set(item.period, item)
  const years = [
    ...new Set(
      [...byPeriod.keys()].map((period) => Number(period.slice(0, 4))),
    ),
  ].sort((a, b) => b - a)
  const peeked = peek ? byPeriod.get(peek) : undefined

  return (
    <section aria-label="업로드 내역" className={styles.history}>
      <header className={styles.head}>
        <h2>업로드 내역</h2>
        <p role="status">
          {items.length}개 중 {done.length}개 확인 · {failed.length}개 실패
          {processing.length > 0 && ` · ${processing.length}개 확인 중`}
        </p>
        <ul aria-hidden="true" className={styles.legend}>
          <li data-status="DONE">확인 완료</li>
          <li data-status="PROCESSING">확인 중</li>
          <li data-status="FAILED">실패</li>
          <li>안 올림</li>
        </ul>
      </header>
      {failed.length > 0 && (
        <ul aria-label="실패한 달" className={styles.failures}>
          {failed.map((item) => {
            const closed = item.error?.code === 'LEGACY_UPLOAD_CLOSED'
            return (
              <li key={item.uploadId}>
                <p>
                  <strong>
                    {monthLabel(item.period)}{' '}
                    {closed ? '과거 기록 마감' : '확인 실패'}
                  </strong>
                  {uploadFailureMessage(
                    item.error,
                    '확인하지 못했어요. 결과에서 자세한 내용을 확인해 주세요.',
                  )}
                </p>
                <Link to={`/upload/${item.uploadId}/result`}>결과 보기</Link>
                {!closed && (
                  <Link
                    aria-label={`${monthLabel(item.period)} 다시 올리기`}
                    className={styles.retry}
                    to={`/upload?retry=${encodeURIComponent(item.period)}`}
                  >
                    다시 올리기
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className={styles.years}>
        {years.map((year, yearIndex) => (
          <div
            aria-label={`${year}년`}
            className={styles.year}
            key={year}
            role="group"
          >
            <b>{year}</b>
            <ol>
              {MONTHS.map((month) => {
                const period = `${year}-${String(month).padStart(2, '0')}`
                const item = byPeriod.get(period)
                const delay = { '--i': yearIndex * 12 + month } as CSSProperties
                if (!item)
                  return (
                    <li key={month} style={delay}>
                      <span className={styles.month}>{month}월</span>
                    </li>
                  )
                return (
                  <li key={month} style={delay}>
                    <Link
                      aria-label={`${monthLabel(period)} ${STATUS_TEXT[item.status]} · 결과 보기`}
                      className={styles.month}
                      data-status={item.status}
                      onBlur={() => setPeek(null)}
                      onFocus={() => setPeek(period)}
                      onMouseEnter={() => setPeek(period)}
                      onMouseLeave={() => setPeek(null)}
                      to={`/upload/${item.uploadId}/result`}
                    >
                      {month}월
                      <small>
                        {item.status === 'DONE' ? (
                          <svg
                            aria-hidden="true"
                            height="12"
                            viewBox="0 0 12 12"
                            width="12"
                          >
                            <path d="M2.5 6.4 5 8.8l4.5-5.4" />
                          </svg>
                        ) : (
                          STATUS_SHORT[item.status]
                        )}
                      </small>
                    </Link>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </div>
      {/* 달에 올리면 그 달 파일을 같은 자리(높이 고정)에 보여 준다. 아래가 밀리지 않는다 */}
      <p className={styles.peek}>
        {peeked ? (
          <>
            <b>{monthLabel(peeked.period)}</b>
            {peeked.fileName} · {dayText(peeked.uploadedAt)} 올림 ·{' '}
            {STATUS_TEXT[peeked.status]}
          </>
        ) : (
          '달을 누르면 그 달 확인 결과가 열려요.'
        )}
      </p>
    </section>
  )
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const STATUS_TEXT = {
  DONE: '확인 완료',
  FAILED: '확인 실패',
  PROCESSING: '확인 중',
} as const
const STATUS_SHORT = {
  DONE: '',
  FAILED: '실패',
  PROCESSING: '확인 중',
} as const
// 2026-11-03T09:12:00 → 11/3
const dayText = (iso: string) =>
  `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

// 대시보드 맨 위 알림 한 줄. 계산 실패와 확인 못 한 달이 같이 있어도 줄은 하나다(11/17: 두 줄이 쌓이면 실패가 너무 부각된다)
export function FailedUploadsNotice({
  calc,
}: {
  /** 방금 계산이 실패했을 때: 그 이유와 닫기. retry가 있으면(확인 못 함) 다시 계산 링크 대신 "상태 다시 확인" */
  calc?: {
    title: string
    message?: string
    onDismiss: () => void
    retry?: () => void
  }
}) {
  const periods = useUploadPeriods()
  const failures =
    periods.data?.items.filter(
      (item) =>
        item.status === 'FAILED' && item.error?.code !== 'LEGACY_UPLOAD_CLOSED',
    ) ?? []
  if (!calc && periods.isError)
    return (
      <p role="alert">
        월별 업로드 상태를 확인하지 못했어요.{' '}
        <Link to="/upload">업로드 내역 확인</Link>
      </p>
    )
  if (!calc && failures.length === 0) return null
  const months = failures.map((item) => monthLabel(item.period)).join(', ')
  return (
    <aside className={styles.notice} role="status">
      <p>
        <strong>{calc ? calc.title : '확인 못 한 달이 있어요'}</strong>
        {calc
          ? calc.message
          : `${months} · 이 달의 새 파일은 계산에 반영되지 않았어요.`}
        {calc &&
          failures.length > 0 &&
          ` · 확인 못 한 달도 ${failures.length}개 있어요`}
      </p>
      {calc && !calc.retry && (
        <Link to="/settings">입고 조건에서 다시 계산</Link>
      )}
      {calc?.retry && (
        <button data-act="" onClick={calc.retry} type="button">
          상태 다시 확인
        </button>
      )}
      {failures.length > 0 && (
        <Link to="/upload">
          {calc ? '업로드 내역' : '실패 이유 확인하고 다시 올리기'}
        </Link>
      )}
      {calc && (
        <button onClick={calc.onDismiss} type="button">
          닫기
        </button>
      )}
    </aside>
  )
}
