import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { apiRequest } from '../../../shared/api/client'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { Tape } from '../../../shared/ui/Tape/Tape'
import { ScenarioInsight } from '../components/ScenarioInsight'
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

// 시안 S05 그래프: 기말 재고는 선, 출고는 막대, 재고가 0인 날은 빨간 점으로 그린다.
const CHART = {
  width: 600,
  height: 220,
  left: 40,
  right: 590,
  top: 12,
  bottom: 180,
}

function TrendChart({ history }: { history: SkuDetail['history'] }) {
  const max = Math.max(...history.map((item) => item.inventory), 1)
  // 눈금이 깔끔하도록 10 단위로 올린다.
  const top = Math.ceil(max / 10) * 10
  const plotWidth = CHART.right - CHART.left
  const gap = history.length > 1 ? plotWidth / (history.length - 1) : 0
  const x = (index: number) => CHART.left + index * gap
  const y = (value: number) =>
    CHART.bottom - (value / top) * (CHART.bottom - CHART.top)
  const barWidth = Math.min(14, Math.max(gap * 0.35, 4))
  const stockouts = history
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.inventory === 0)
  const middle = history[Math.floor((history.length - 1) / 2)]

  return (
    <>
      <svg
        aria-label="최근 재고와 출고 추이 그래프"
        className={styles.chart}
        role="img"
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      >
        <title>최근 재고와 출고 추이</title>
        {[0, top / 2, top].map((tick) => (
          <g key={tick}>
            <line
              className={styles.gridLine}
              x1={CHART.left}
              x2={CHART.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className={styles.tick} x={CHART.left - 8} y={y(tick) + 4}>
              {tick}
            </text>
          </g>
        ))}
        {history.map((item, index) => (
          <rect
            className={styles.outboundBar}
            height={CHART.bottom - y(item.outbound)}
            key={item.date}
            style={{ animationDelay: `${index * 60}ms` }}
            width={barWidth}
            x={x(index) - barWidth / 2}
            y={y(item.outbound)}
          />
        ))}
        <polyline
          className={styles.inventoryLine}
          fill="none"
          points={history
            .map((item, index) => `${x(index)},${y(item.inventory)}`)
            .join(' ')}
        />
        {stockouts.map(({ item, index }) => (
          <circle
            className={styles.zeroPoint}
            cx={x(index)}
            cy={CHART.bottom}
            key={item.date}
            r="6"
          />
        ))}
        {stockouts.length > 0 && (
          <text
            className={styles.stockoutLabel}
            x={x(stockouts[Math.floor(stockouts.length / 2)].index)}
            y={CHART.bottom + 26}
          >
            품절 {stockouts.length}일
          </text>
        )}
      </svg>
      <div className={styles.dates}>
        <span>{history[0]?.date}</span>
        {history.length > 2 && <span>{middle?.date}</span>}
        <span>{history.at(-1)?.date}</span>
      </div>
    </>
  )
}

// 예측 정확도 그래프: 가로는 기간, 세로는 출고량(개). 실제 선과 예측 선이 얼마나 붙어 있는지로 정확도를 봅니다.
function AccuracyChart({ history }: { history: SkuDetail['history'] }) {
  const box = {
    width: 600,
    height: 236,
    left: 56,
    right: 568,
    top: 36,
    bottom: 186,
  }
  const max = Math.max(
    ...history.map((item) => Math.max(item.outbound, item.predictedOutbound)),
    1,
  )
  const top = Math.ceil(max / 5) * 5
  const gap =
    history.length > 1 ? (box.right - box.left) / (history.length - 1) : 0
  const x = (index: number) => box.left + index * gap
  const y = (value: number) =>
    box.bottom - (value / top) * (box.bottom - box.top)
  const line = (pick: (item: SkuDetail['history'][number]) => number) =>
    history.map((item, index) => `${x(index)},${y(pick(item))}`).join(' ')
  const labelIndexes = [
    0,
    Math.floor((history.length - 1) / 2),
    history.length - 1,
  ]

  return (
    <svg
      aria-label="과거 실제 출고량과 예측 출고량 비교 그래프"
      className={styles.chart}
      role="img"
      viewBox={`0 0 ${box.width} ${box.height}`}
    >
      <title>과거 실제 출고량과 예측 출고량 비교</title>
      {[0, top / 2, top].map((tick) => (
        <g key={tick}>
          <line
            className={styles.gridLine}
            x1={box.left}
            x2={box.right}
            y1={y(tick)}
            y2={y(tick)}
          />
          <text className={styles.tick} x={box.left - 8} y={y(tick) + 4}>
            {tick}
          </text>
        </g>
      ))}
      <text className={styles.axisTitle} x={0} y={box.top - 18}>
        출고량(개)
      </text>
      <polyline
        className={styles.actualLine}
        fill="none"
        points={line((item) => item.outbound)}
      />
      <polyline
        className={styles.predictionLine}
        fill="none"
        points={line((item) => item.predictedOutbound)}
      />
      {[...new Set(labelIndexes)].map((index) => (
        <text
          className={styles.xTick}
          key={history[index].date}
          x={x(index)}
          y={box.bottom + 20}
        >
          {history[index].date}
        </text>
      ))}
      <text
        className={styles.xTitle}
        x={(box.left + box.right) / 2}
        y={box.bottom + 42}
      >
        기간
      </text>
    </svg>
  )
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
              {/* 가장 중요한 숫자라 테이프를 밑줄처럼 붙인다 */}
              <strong className={styles.recoQty}>
                <Tape className={styles.recoTape} />
                <span>{data.recommendation.quantity.toLocaleString()}개</span>
              </strong>
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
                <h2>재고·출고 추이</h2>
                <div className={styles.legend} aria-label="그래프 범례">
                  <span data-series="inventory">기말 재고</span>
                  <span data-series="outbound">출고</span>
                  <span data-series="stockout">품절일 (계산에서 제외)</span>
                </div>
              </div>
              <TrendChart history={data.history} />
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

          <ScenarioInsight
            inboundUnit={data.calculation.inboundUnit}
            key={skuId}
            skuId={skuId}
          />

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
            <div className={styles.legend} aria-label="그래프 범례">
              <span data-series="actual">실제 출고량</span>
              <span data-series="prediction">예측 출고량</span>
            </div>
            <div className={styles.accuracyGrid}>
              <AccuracyChart history={data.history} />
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
