import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { Button } from '../../../shared/ui/Button/Button'
import { getUploadResult } from '../model/uploadApi'
import {
  describeExclusion,
  formatDate,
  formatPeriod,
} from '../model/uploadFormat'
import styles from './UploadResultPage.module.css'

// 정제·검산이 끝날 때까지 2초마다 다시 확인한다.
const POLL_INTERVAL_MS = 2000

export function UploadResultPage() {
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

  if (result.isPending || result.data?.status === 'PROCESSING') {
    return (
      <AsyncState
        description="수불부 형식과 재고 숫자를 확인하고 있어요."
        status="loading"
        title="수불부를 확인하고 있어요"
      />
    )
  }

  if (result.isError) {
    return (
      <AsyncState
        description={result.error.message}
        onRetry={() => void result.refetch()}
        status="error"
        title="업로드 결과를 불러오지 못했어요"
      />
    )
  }

  const data = result.data

  if (data.status === 'FAILED') {
    return (
      <AsyncState
        description="수불부를 고친 뒤 다시 올려 주세요."
        onRetry={() => navigate('/upload')}
        retryLabel="다시 올리기"
        status="error"
        title="수불부를 처리하지 못했어요"
      />
    )
  }

  const { checkedSkuCount, excludedSkus, targetSkuCount } = data.validation
  const excludedCount = excludedSkus.length

  return (
    <div className={styles.page}>
      <header>
        <h1>수불부를 확인했어요</h1>
      </header>

      {replaced && replaced.length > 0 && (
        <p className={styles.replaced} role="status">
          <span aria-hidden="true">↻</span>
          {replaced.join(', ')} 자료를 새 파일로 바꿨어요. 이전 결과는 이력으로
          남아요.
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

      <section className={styles.metrics} aria-label="업로드 요약">
        <article>
          <span>자료 기간</span>
          <strong>{formatPeriod(data.periodStart, data.periodEnd)}</strong>
        </article>
        <article>
          <span>기준일 (자료 마지막 날)</span>
          <strong>{formatDate(data.asOfDate)}</strong>
        </article>
        <article>
          <span>계산 대상</span>
          <strong>{targetSkuCount}개 상품</strong>
        </article>
      </section>

      <section className={styles.report}>
        <div className={styles.sectionTitle}>
          <h2>검증 리포트</h2>
          <span>{excludedCount}개 상품은 계산에서 뺐어요</span>
        </div>
        {excludedSkus.length === 0 ? (
          <p className={styles.empty}>재고 숫자가 모두 맞아요.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>상품</th>
                  <th>날짜</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {excludedSkus.map((issue) => {
                  const reason = describeExclusion(issue.reason, issue.date)
                  return (
                    <tr key={`${issue.skuBarcode}-${issue.date}`}>
                      <td>
                        <strong>{issue.skuName}</strong>
                        <span>{issue.skuBarcode}</span>
                      </td>
                      <td>{formatDate(issue.date)}</td>
                      <td title={issue.reason}>
                        <div className={styles.reason}>
                          <div>
                            {reason.diff && <b>{reason.diff}</b>}
                            <small>{reason.fix}</small>
                          </div>
                          <em>{reason.label}</em>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.help}>
          수불부를 고쳐 같은 기간을 다시 올리면 확인 후 교체하고 다시 계산해요.
        </p>
      </section>

      {data.matchedReceipts.length > 0 && (
        <aside className={styles.orderNotice}>
          <strong>
            ✓ 이미 발주한 물량 {data.matchedReceipts.length}건이 입고로
            확인됐어요
          </strong>
          {data.matchedReceipts.map((receipt) => (
            <span key={receipt.receiptId}>
              {receipt.skuName} {receipt.quantity}개 ·{' '}
              {formatDate(receipt.receivedOn)} 입고 · 계산에서 두 번 빼지 않아요
            </span>
          ))}
        </aside>
      )}

      <footer className={styles.actions}>
        <Button onClick={() => navigate('/dashboard')} variant="secondary">
          나중에 하기
        </Button>
        <Button onClick={() => navigate('/settings')}>
          입고 조건 확인하기
        </Button>
      </footer>
    </div>
  )
}
