import { UploadReceiptSnapshot } from '../../receipts/components/UploadReceiptSnapshot'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { ApiError } from '../../../shared/api/client'
import { useCalculation } from '../../../shared/api/calculationContext'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { Button } from '../../../shared/ui/Button/Button'
import { replacedLabel } from '../model/fileValidation'
import { getUploadResult, uploadFailureMessage } from '../model/uploadApi'
import {
  describeExclusion,
  formatDate,
  formatPeriod,
} from '../model/uploadFormat'
import { FINISH_MS, UploadProcessing } from './UploadProcessing'
import styles from './UploadResultPage.module.css'
import ledgerDone from '../assets/ledger-done.webp'

// 정제·검산이 끝날 때까지 2초마다 다시 확인한다.
const POLL_INTERVAL_MS = 2000

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function UploadResultPage() {
  const { trackRun, trackUpload } = useCalculation()
  const { uploadId } = useParams()
  const navigate = useNavigate()
  // 업로드 화면에서 같은 기간을 덮어써 올렸으면 그 기간 목록이 넘어온다.
  const replaced = (useLocation().state as { replaced?: string[] } | null)
    ?.replaced
  const result = useQuery({
    queryKey: ['upload-result', uploadId],
    queryFn: () => getUploadResult(uploadId ?? ''),
    enabled: Boolean(uploadId),
    refetchInterval: (query) =>
      query.state.data?.status === 'PROCESSING' ? POLL_INTERVAL_MS : false,
  })

  const processing = result.isPending || result.data?.status === 'PROCESSING'
  // 업로드가 계산을 시작했으면 그 번호를 들고 가서 대시보드가 계산 상태를 보여 준다
  const runId = result.data?.runId
  const dashboardPath = runId ? `/dashboard?run=${runId}` : '/dashboard'

  // 확인 단계도 오른쪽 아래 작은 창·대시보드가 따라가도록 알린다
  const stillProcessing = result.data?.status === 'PROCESSING'
  useEffect(() => {
    if (stillProcessing) trackUpload(uploadId)
  }, [stillProcessing, uploadId, trackUpload])

  const calculationId =
    result.data?.status === 'DONE' ? result.data.runId : null
  useEffect(() => {
    trackRun(calculationId)
  }, [calculationId, trackRun])

  // 처리 중이던 화면이 정상으로 끝나면 1.5초 동안 끝난 순간 연출을 먼저 보여 준다.
  // 이미 끝난 기록을 열 때와 움직임 줄이기 설정에서는 건너뛴다.
  const [wasProcessing, setWasProcessing] = useState(processing)
  const [finishing, setFinishing] = useState(false)
  if (processing !== wasProcessing) {
    setWasProcessing(processing)
    if (
      wasProcessing &&
      result.data?.status === 'DONE' &&
      !prefersReducedMotion()
    ) {
      setFinishing(true)
    }
  }
  useEffect(() => {
    if (!finishing) return
    const timer = setTimeout(() => setFinishing(false), FINISH_MS)
    return () => clearTimeout(timer)
  }, [finishing])

  // 확인 중과 끝난 순간은 같은 화면 요소라서 장면이 끊기지 않고 이어진다.
  if (processing || finishing) {
    return (
      <UploadProcessing
        done={finishing}
        onGoDashboard={() => navigate(dashboardPath)}
      />
    )
  }

  if (result.isError) {
    // 없는 기록(404)이나 남의 기록(403)은 다시 불러와도 같으니 업로드 화면으로 보낸다.
    const gone =
      result.error instanceof ApiError &&
      (result.error.status === 404 || result.error.status === 403)
    return gone ? (
      <AsyncState
        description="지워졌거나 다른 계정으로 올린 기록이에요. 수불부를 다시 올려 주세요."
        onRetry={() => navigate('/upload')}
        retryLabel="업로드 화면으로"
        status="error"
        title="이 업로드 결과를 찾을 수 없어요"
      />
    ) : (
      <AsyncState
        description={result.error.message}
        onRetry={() => void result.refetch()}
        status="error"
        title="업로드 결과를 불러오지 못했어요"
      />
    )
  }

  const data = result.data

  if (data.status === 'FAILED' && data.error?.code === 'LEGACY_UPLOAD_CLOSED') {
    return (
      <AsyncState
        description="원본과 이력은 보존했으며 이 기록은 다시 처리하지 않습니다. 현재 결과는 대시보드에서 확인해 주세요."
        onRetry={() => navigate('/dashboard')}
        retryLabel="대시보드로"
        status="empty"
        title="과거 업로드 기록을 마감했어요"
      />
    )
  }

  if (data.status === 'FAILED') {
    // 파일 형식 문제(INVALID_SOURCE·이유 없음)만 고쳐서 올리라고 하고, 서버 쪽 문제면 파일은 그대로 다시 올리게 한다.
    const fileProblem = !data.error || data.error.code === 'INVALID_SOURCE'
    return fileProblem ? (
      <AsyncState
        description={uploadFailureMessage(
          data.error,
          '수불부 형식을 확인하고 고친 뒤 다시 올려 주세요.',
        )}
        onRetry={() => navigate('/upload')}
        retryLabel="다시 올리기"
        status="error"
        title="수불부를 처리하지 못했어요"
      />
    ) : (
      <AsyncState
        description="파일 문제는 아니에요. 잠시 뒤 같은 파일을 그대로 다시 올려 주세요."
        onRetry={() => navigate('/upload')}
        retryLabel="같은 파일 다시 올리기"
        status="error"
        title="서버에서 수불부를 처리하지 못했어요"
      />
    )
  }

  const { checkedSkuCount, excludedSkus, targetSkuCount } = data.validation
  const excludedCount = excludedSkus.length

  return (
    <div className={styles.page}>
      {/* 다 올린 순간: 선반이 상자로 채워진 그림(11/13, 로그인 그림과 같은 톤) */}
      <header className={styles.doneHead} data-rise="">
        <img alt="" height={160} src={ledgerDone} width={214} />
        <h1>수불부를 확인했어요</h1>
      </header>

      {replaced && replaced.length > 0 && (
        <p className={styles.replaced} role="status">
          <span aria-hidden="true">↻</span>
          {/* 여러 달을 한 번에 바꾸면 쉼표 목록이 몇 줄로 꺾여서(11/12): 몇 개월인지를 크게, 어느 달인지는 아래 줄에 */}
          <span className={styles.replacedText}>
            <b>
              <em className={styles.count}>
                {replacedLabel(replaced).count}개월
              </em>{' '}
              자료를 새 파일로 바꿨어요
            </b>
            <small>
              {replacedLabel(replaced).months} · 이전 결과는 이력으로 남아요
            </small>
          </span>
        </p>
      )}

      <ol className={styles.steps} aria-label="업로드 진행 단계">
        <li data-complete="true">
          <strong>
            <i aria-hidden="true" className={styles.mark}>
              ✓
            </i>
            업로드
          </strong>
          <span>파일 형식 확인 완료</span>
        </li>
        <li data-complete="true">
          <strong>
            <i aria-hidden="true" className={styles.mark}>
              ✓
            </i>
            정제·검산
          </strong>
          <span>
            {checkedSkuCount}개 상품 · {excludedCount}개 제외
          </span>
        </li>
        <li>
          <strong>
            <i aria-hidden="true" className={styles.mark}>
              3
            </i>
            입고 조건 확인
          </strong>
          <span>처음 한 번만 확인해요</span>
        </li>
      </ol>

      {/* 주제마다 카드 하나. 카드 제목이 곧 결론이고, 이유·할 일은 그 카드 안에서 위에서 아래로 읽힌다. */}
      <section aria-labelledby="result-calculated" className={styles.result}>
        <h2 className={styles.resultTitle} id="result-calculated">
          <i aria-hidden="true" className={styles.mark} data-tone="ok">
            ✓
          </i>
          이번 파일의 {targetSkuCount}개 상품이 검산을 통과했어요
        </h2>
        <p className={styles.resultSub}>
          자료 {formatPeriod(data.periodStart, data.periodEnd)} · 기준일{' '}
          {formatDate(data.asOfDate)} ·{' '}
          {excludedCount > 0
            ? `올린 ${checkedSkuCount}개 중 ${excludedCount}개는 뺐어요`
            : '재고 숫자가 모두 맞아요'}
        </p>
      </section>

      <p>
        계산 결과에는 이전 달의 검산 제외와 판매 기록 부족도 반영돼요. 최종 계산
        상태와 상품 수는 대시보드에서 확인해 주세요.
      </p>

      {excludedCount > 0 && (
        <section aria-labelledby="result-excluded" className={styles.result}>
          <div className={styles.resultHead}>
            <h2 className={styles.resultTitle} id="result-excluded">
              <i aria-hidden="true" className={styles.mark} data-tone="warn">
                !
              </i>
              이번 파일에서 {excludedCount}개 상품을 제외했어요
            </h2>
            <Button
              className={styles.retryButton}
              onClick={() => navigate('/upload')}
              variant="secondary"
            >
              고친 파일 다시 올리기 →
            </Button>
          </div>
          <ul className={styles.excluded}>
            {excludedSkus.map((issue) => {
              const reason = describeExclusion(issue.reason, issue.date)
              return (
                <li
                  key={`${issue.skuBarcode}-${issue.date}`}
                  title={issue.reason}
                >
                  <p className={styles.excludedName}>
                    <strong>{issue.skuName}</strong>
                    <small>
                      {issue.skuBarcode} · {formatDate(issue.date)}
                    </small>
                  </p>
                  <p className={styles.excludedWhy}>
                    <em>{reason.label}</em>
                    {reason.summary}
                  </p>
                  {reason.fix && (
                    <p className={styles.excludedFix}>
                      <b>고치는 방법</b>
                      {reason.fix} 같은 기간으로 다시 올리면 바꿔서 다시
                      계산해요.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <UploadReceiptSnapshot matching={data.receiptMatching} />
      {data.matchedReceipts.length > 0 && (
        <>
          <p className={styles.asideLabel}>따로 알려드려요</p>
          <section aria-labelledby="result-receipts" className={styles.result}>
            <h2 className={styles.resultTitleSmall} id="result-receipts">
              이미 발주한 물량 {data.matchedReceipts.length}건이 입고로
              확인됐어요
            </h2>
            {data.matchedReceipts.map((receipt) => (
              <p className={styles.resultSub} key={receipt.receiptId}>
                {receipt.skuName} {receipt.quantity}개 ·{' '}
                {formatDate(receipt.receivedOn)} 입고 · 계산에서 두 번 빼지
                않아요
              </p>
            ))}
          </section>
        </>
      )}

      <footer className={styles.actions}>
        <Button onClick={() => navigate(dashboardPath)} variant="secondary">
          나중에 하기
        </Button>
        <Button onClick={() => navigate('/settings')}>
          입고 조건 확인하기
        </Button>
      </footer>
    </div>
  )
}
