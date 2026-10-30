import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'

import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { Tape } from '../../../shared/ui/Tape/Tape'
import { ScenarioInsight } from '../components/ScenarioInsight'
import {
  getSkuDetail,
  type SettingSource,
  type SkuDetail,
} from '../model/skuApi'
import styles from './SkuPage.module.css'

type AccuracyHistory = NonNullable<SkuDetail['accuracy']>['history']

const accuracyLabels = {
  high: '높음',
  medium: '보통',
  low: '낮음',
} as const

const sourceLabels: Record<SettingSource, string> = {
  PRODUCT: '상품별',
  DEFAULT: '기본값',
  SUGGESTED: '제안값',
  ESTIMATED: '추정',
}

// 기획서 계산식: A = 작년 같은 시기 × 올해 최근 흐름, B = 최근 28일 평균
const methodLabels = {
  A: '계산식 A · 작년 같은 시기 + 최근 흐름',
  B: '기준 B · 최근 28일 평균',
} as const

const count = (value: number | null) =>
  value == null ? '—' : `${value.toLocaleString()}개`

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
function AccuracyChart({ history }: { history: AccuracyHistory }) {
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
  const line = (pick: (item: AccuracyHistory[number]) => number) =>
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
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['sku', skuId],
    queryFn: () => getSkuDetail(skuId),
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
    pending: '계산 전',
  }[data.status]
  const settingRows = (
    <dl className={styles.evidence}>
      <div>
        <dt>리드타임</dt>
        <dd>
          {data.settings.leadTimeDays ?? '—'}일
          <span className={styles.source}>
            {sourceLabels[data.settings.leadTimeSource]}
          </span>
        </dd>
      </div>
      <div>
        <dt>발주 주기</dt>
        <dd>
          {data.settings.reviewCycleDays ?? '—'}일
          <span className={styles.source}>
            {sourceLabels[data.settings.reviewCycleSource]}
          </span>
        </dd>
      </div>
    </dl>
  )

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

      {data.status === 'pending' ? (
        <section className={styles.card}>
          <AsyncState
            description="입고 조건을 확인하고 계산하면 권장 입고량이 나와요."
            onRetry={() => navigate('/settings')}
            retryLabel="입고 조건 확인하기"
            status="empty"
            title="아직 계산 전이에요"
          />
          {settingRows}
        </section>
      ) : data.status === 'unavailable' ? (
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
                {data.history.length > 0 && (
                  <div className={styles.legend} aria-label="그래프 범례">
                    <span data-series="inventory">기말 재고</span>
                    <span data-series="outbound">출고</span>
                    <span data-series="stockout">품절일 (계산에서 제외)</span>
                  </div>
                )}
              </div>
              {data.history.length > 0 ? (
                <TrendChart history={data.history} />
              ) : (
                <AsyncState
                  description="서버가 날짜별 기록을 보내 주면 여기에 그래프가 그려져요."
                  status="empty"
                  title="재고·출고 기록을 모으는 중이에요"
                />
              )}
            </section>

            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <h2>계산 근거</h2>
              </div>
              {data.method && (
                <div className={styles.formulas}>
                  {(['A', 'B'] as const).map((name) => {
                    const applied = data.method?.applied === name
                    const note = applied
                      ? data.method?.fallback
                        ? '적용 · 대체'
                        : '적용 · 평가로 선정'
                      : data.method?.fallback
                        ? '쓸 수 없음'
                        : `평가에서 ${data.method?.applied}가 더 정확했어요`
                    return (
                      <article data-selected={applied} key={name}>
                        <span>{methodLabels[name]}</span>
                        <strong>
                          {applied ? count(data.calculation.forecastQty) : '—'}
                        </strong>
                        <em>{note}</em>
                      </article>
                    )
                  })}
                </div>
              )}
              {data.method?.reason && (
                <p className={styles.methodReason}>{data.method.reason}</p>
              )}
              <dl className={styles.evidence}>
                <div>
                  <dt>여유 배수</dt>
                  <dd>{data.calculation.multiplier}배</dd>
                </div>
                <div>
                  <dt>커버 기간</dt>
                  <dd>{data.calculation.coverDays}일</dd>
                </div>
                <div>
                  <dt>시작 재고</dt>
                  <dd>
                    {count(data.calculation.startingInventory)}
                    {data.calculation.startingInventoryEstimated && (
                      <small> 추정</small>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>기존 발주</dt>
                  <dd>{count(data.calculation.existingOrders)}</dd>
                </div>
                <div>
                  <dt>입고 단위</dt>
                  <dd>{count(data.calculation.inboundUnit)}</dd>
                </div>
                <div>
                  <dt>리드타임</dt>
                  <dd>
                    {data.settings.leadTimeDays ?? '—'}일
                    <span className={styles.source}>
                      {sourceLabels[data.settings.leadTimeSource]}
                    </span>
                  </dd>
                </div>
                {data.calculation.rawQuantity != null && (
                  <div>
                    <dt>반올림 전 필요량</dt>
                    <dd>{data.calculation.rawQuantity.toFixed(1)}개</dd>
                  </div>
                )}
              </dl>
            </section>
          </div>

          <ScenarioInsight
            inboundUnit={data.calculation.inboundUnit ?? 1}
            key={skuId}
            skuId={skuId}
          />

          {data.accuracy && <AccuracyCard accuracy={data.accuracy} />}
        </>
      )}
    </div>
  )
}

// 기획서 말 그대로: 커버 성공률(권장량대로 넣었으면 품절을 피했는지)과 예측 오차
function AccuracyCard({
  accuracy,
}: {
  accuracy: NonNullable<SkuDetail['accuracy']>
}) {
  const { coverSuccess, coverTrials, errorRate } = accuracy
  const coverRate =
    coverSuccess != null && coverTrials
      ? Math.round((coverSuccess / coverTrials) * 100)
      : null
  // 점은 최대 10개. 시도가 10번보다 많으면 비율대로 칠한다.
  const dots = Math.min(coverTrials ?? 0, 10)
  const filled =
    coverTrials && coverSuccess != null
      ? Math.round((coverSuccess / coverTrials) * dots)
      : 0

  return (
    <section className={styles.card}>
      <div className={styles.accuracyHeader}>
        <h2>예측 정확도</h2>
        <span className={styles.accuracyGrade} data-grade={accuracy.grade}>
          정확도 {accuracyLabels[accuracy.grade]}
        </span>
      </div>
      <div className={styles.accuracyBoxes}>
        <div data-tone="cover">
          <span>커버 성공률</span>
          <strong>{coverRate == null ? '—' : `${coverRate}%`}</strong>
          {dots > 0 && (
            <span
              aria-label={`${coverTrials}번 중 ${coverSuccess}번 성공`}
              className={styles.dots}
              role="img"
            >
              {Array.from({ length: dots }, (_, index) => (
                <i data-on={index < filled} key={index} />
              ))}
            </span>
          )}
          <p>
            {coverRate == null
              ? '비교할 지난 예측이 아직 없어요.'
              : `${coverTrials}번 중 ${coverSuccess}번, 권장량대로 넣었으면 품절을 피했어요.`}
          </p>
        </div>
        <div data-tone="error">
          <span>예측 오차</span>
          <strong>{errorRate == null ? '—' : `${errorRate}%`}</strong>
          {errorRate != null && (
            <span aria-hidden="true" className={styles.bar}>
              <i style={{ width: `${Math.min(errorRate, 100)}%` }} />
            </span>
          )}
          <p>예측이 실제 출고와 평균 이만큼 빗나갔어요. 낮을수록 좋아요.</p>
        </div>
      </div>
      {accuracy.range && (
        <p className={styles.range}>
          예측 범위 {accuracy.range.low.toLocaleString()}~
          {accuracy.range.high.toLocaleString()}개 · 참고용
        </p>
      )}
      {accuracy.history.length > 0 && (
        <>
          <div className={styles.legend} aria-label="그래프 범례">
            <span data-series="actual">실제 출고량</span>
            <span data-series="prediction">예측 출고량</span>
          </div>
          <AccuracyChart history={accuracy.history} />
        </>
      )}
    </section>
  )
}
