import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'

import { apiRequest } from '../../../shared/api/client'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { Button } from '../../../shared/ui/Button/Button'
import styles from './UploadResultPage.module.css'

type UploadResult = {
  calculatedCount: number
  excludedCount: number
  orderedItems: Array<{
    name: string
    quantity: number
    arrivalDate: string
  }>
  period: string
  referenceDate: string
  status: 'processing' | 'completed' | 'failed'
  totalCount: number
  validationIssues: Array<{
    barcode: string
    date: string
    name: string
    reason: string
  }>
}

export function UploadResultPage() {
  const { uploadId } = useParams()
  const navigate = useNavigate()
  const result = useQuery({
    queryKey: ['upload-result', uploadId],
    queryFn: () => apiRequest<UploadResult>(`/uploads/${uploadId}`),
    enabled: Boolean(uploadId),
  })

  if (result.isPending) {
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

  return (
    <div className={styles.page}>
      <header>
        <h1>수불부를 확인했어요</h1>
      </header>

      <ol className={styles.steps} aria-label="업로드 진행 단계">
        <li data-complete="true">
          <strong>✓ 업로드</strong>
          <span>파일 형식 확인 완료</span>
        </li>
        <li data-complete="true">
          <strong>✓ 정제·검산</strong>
          <span>
            {data.totalCount}개 상품 · {data.excludedCount}개 제외
          </span>
        </li>
        <li>
          <strong>3 입고 조건 확인</strong>
          <span>처음 한 번만 확인해요</span>
        </li>
      </ol>

      <section className={styles.metrics} aria-label="업로드 요약">
        <article>
          <span>자료 기간</span>
          <strong>{data.period}</strong>
        </article>
        <article>
          <span>기준일 (자료 마지막 날)</span>
          <strong>{data.referenceDate}</strong>
        </article>
        <article>
          <span>계산 대상</span>
          <strong>{data.calculatedCount}개 상품</strong>
        </article>
      </section>

      <section className={styles.report}>
        <div className={styles.sectionTitle}>
          <h2>검증 리포트</h2>
          <span>{data.excludedCount}개 상품은 계산에서 뺐어요</span>
        </div>
        {data.validationIssues.length === 0 ? (
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
                {data.validationIssues.map((issue) => (
                  <tr key={`${issue.barcode}-${issue.date}`}>
                    <td>
                      <strong>{issue.name}</strong>
                      <span>{issue.barcode}</span>
                    </td>
                    <td>{issue.date}</td>
                    <td>{issue.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.help}>
          수불부를 고쳐 같은 기간을 다시 올리면 확인 후 교체하고 다시 계산해요.
        </p>
      </section>

      {data.orderedItems.map((order) => (
        <aside className={styles.orderNotice} key={order.name}>
          <strong>✓ 이미 발주한 물량 1건이 입고로 확인됐어요</strong>
          <span>
            {order.name} {order.quantity}개 · {order.arrivalDate} 입고 ·
            계산에서 두 번 빼지 않아요
          </span>
        </aside>
      ))}

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
