import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { apiRequest } from '../../../shared/api/client'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import styles from './SkuPage.module.css'

export type SkuDetail = {
  id: string
  name: string
  barcode: string
  fulfillment: string
  status: 'ready' | 'reference' | 'unavailable'
  unavailableReason?: string
  recommendation: {
    quantity: number
    cost: number
    expectedStockoutDate: string
  }
  history: Array<{
    date: string
    inventory: number
    outbound: number
    predictedOutbound: number
  }>
  calculation: {
    formulaA: number
    formulaB: number
    selectedFormula: 'A' | 'B'
    multiplier: number
    coverDays: number
    startingInventory: number
    startingInventoryEstimated: boolean
    existingOrders: number
    inboundUnit: number
    rawQuantity: number
  }
  accuracy: {
    grade: 'high' | 'medium' | 'low'
    score: number
    survivedRatio: number
    description: string
  }
}

const accuracyLabels = {
  high: '높음',
  medium: '보통',
  low: '낮음',
} as const

function toPoints(values: number[], width = 560, height = 170) {
  const max = Math.max(...values, 1)
  const gap = values.length > 1 ? width / (values.length - 1) : 0

  return values
    .map((value, index) => `${index * gap},${height - (value / max) * height}`)
    .join(' ')
}

export function SkuPage() {
  const { skuId = '' } = useParams()
  const query = useQuery({
    queryKey: ['sku', skuId],
    queryFn: () => apiRequest<SkuDetail>(`/skus/${skuId}`),
  })

  if (query.isPending) {
    return (
      <AsyncState
        description="입고 판단에 필요한 재고와 출고 기록을 모으고 있어요."
        status="loading"
        title="상품 상세를 불러오고 있어요"
      />
    )
  }

  if (query.isError) {
    return (
      <AsyncState
        description={query.error.message}
        onRetry={() => void query.refetch()}
        status="error"
        title="상품 상세를 불러오지 못했어요"
      />
    )
  }

  const data = query.data
  const statusLabel = {
    ready: '계산 완료',
    reference: '참고용',
    unavailable: '계산 불가',
  }[data.status]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{data.fulfillment}</span>
          <h1>{data.name}</h1>
          <p>바코드 {data.barcode}</p>
        </div>
        <span className={styles.status} data-status={data.status}>
          {statusLabel}
        </span>
      </header>

      {data.status === 'unavailable' ? (
        <AsyncState
          description={
            data.unavailableReason ??
            '판매 기록이 더 쌓이면 권장 입고량을 계산할 수 있어요.'
          }
          status="empty"
          title="아직 계산할 데이터가 부족해요"
        />
      ) : (
        <>
          {data.status === 'reference' && (
            <aside className={styles.notice}>
              판매 기록이 짧아 예측 범위가 넓어요. 권장량은 참고용으로 확인해
              주세요.
            </aside>
          )}
          <section className={styles.recommendation}>
            <div>
              <span>권장 입고량</span>
              <strong>{data.recommendation.quantity.toLocaleString()}개</strong>
            </div>
            <dl>
              <div>
                <dt>예상 사입비</dt>
                <dd>{data.recommendation.cost.toLocaleString()}원</dd>
              </div>
              <div>
                <dt>현재 예상 소진일</dt>
                <dd>{data.recommendation.expectedStockoutDate}</dd>
              </div>
            </dl>
          </section>

          <div className={styles.mainGrid}>
            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>재고·출고 추이</h2>
                  <p>재고가 0이 된 날은 빨간 점으로 표시했어요.</p>
                </div>
                <div className={styles.legend} aria-label="그래프 범례">
                  <span data-series="inventory">재고</span>
                  <span data-series="outbound">출고</span>
                </div>
              </div>
              <svg
                aria-label="최근 재고와 출고 추이 그래프"
                className={styles.chart}
                role="img"
                viewBox="0 0 560 190"
              >
                <title>최근 재고와 출고 추이</title>
                <line x1="0" x2="560" y1="170" y2="170" />
                <polyline
                  className={styles.inventoryLine}
                  fill="none"
                  points={toPoints(data.history.map((item) => item.inventory))}
                />
                <polyline
                  className={styles.outboundLine}
                  fill="none"
                  points={toPoints(data.history.map((item) => item.outbound))}
                />
                {data.history.map((item, index) => {
                  if (item.inventory !== 0) return null
                  const x = (index * 560) / Math.max(data.history.length - 1, 1)
                  return (
                    <circle
                      className={styles.zeroPoint}
                      cx={x}
                      cy="170"
                      key={item.date}
                      r="6"
                    />
                  )
                })}
              </svg>
              <div className={styles.dates}>
                <span>{data.history[0]?.date}</span>
                <span>{data.history.at(-1)?.date}</span>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>계산 근거</h2>
                  <p>두 계산식 중 더 보수적인 값을 선택했어요.</p>
                </div>
                <span className={styles.formulaBadge}>
                  계산식 {data.calculation.selectedFormula} 선택
                </span>
              </div>
              <div className={styles.formulas}>
                <article
                  data-selected={data.calculation.selectedFormula === 'A'}
                >
                  <span>계산식 A · 최근 출고량</span>
                  <strong>{data.calculation.formulaA}개</strong>
                </article>
                <article
                  data-selected={data.calculation.selectedFormula === 'B'}
                >
                  <span>계산식 B · 품절 보정</span>
                  <strong>{data.calculation.formulaB}개</strong>
                </article>
              </div>
              <dl className={styles.evidence}>
                <div>
                  <dt>수요 배수</dt>
                  <dd>{data.calculation.multiplier}배</dd>
                </div>
                <div>
                  <dt>확보 기간</dt>
                  <dd>{data.calculation.coverDays}일</dd>
                </div>
                <div>
                  <dt>시작 재고</dt>
                  <dd>
                    {data.calculation.startingInventory}개
                    {data.calculation.startingInventoryEstimated && (
                      <small> 추정</small>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>기존 발주</dt>
                  <dd>{data.calculation.existingOrders}개</dd>
                </div>
                <div>
                  <dt>입고 단위</dt>
                  <dd>{data.calculation.inboundUnit}개</dd>
                </div>
                <div>
                  <dt>반올림 전 필요량</dt>
                  <dd>{data.calculation.rawQuantity.toFixed(1)}개</dd>
                </div>
              </dl>
            </section>
          </div>

          <section className={styles.card}>
            <div className={styles.accuracyHeader}>
              <div>
                <h2>예측 정확도</h2>
                <p>{data.accuracy.description}</p>
              </div>
              <div
                className={styles.accuracyScore}
                data-grade={data.accuracy.grade}
              >
                <span>{accuracyLabels[data.accuracy.grade]}</span>
                <strong>{data.accuracy.score}점</strong>
              </div>
            </div>
            <div className={styles.accuracyGrid}>
              <svg
                aria-label="과거 실제 출고량과 예측 출고량 비교 그래프"
                className={styles.chart}
                role="img"
                viewBox="0 0 560 190"
              >
                <title>과거 실제 출고량과 예측 출고량 비교</title>
                <line x1="0" x2="560" y1="170" y2="170" />
                <polyline
                  className={styles.actualLine}
                  fill="none"
                  points={toPoints(data.history.map((item) => item.outbound))}
                />
                <polyline
                  className={styles.predictionLine}
                  fill="none"
                  points={toPoints(
                    data.history.map((item) => item.predictedOutbound),
                  )}
                />
              </svg>
              <div className={styles.survived}>
                <span>지난 예측 생존 비율</span>
                <strong>{data.accuracy.survivedRatio}%</strong>
                <p>예측 기간 동안 품절 없이 판매한 날의 비율이에요.</p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
