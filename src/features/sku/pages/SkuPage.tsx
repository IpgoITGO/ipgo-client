import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { calculationReason } from '../../../shared/lib/calculationReason'
import { ReasonDetail } from '../../../shared/ui/ReasonDetail/ReasonDetail'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { BoxLoader } from '../../../shared/ui/BoxLoader/BoxLoader'
import { EmptyValue } from '../../../shared/ui/EmptyValue/EmptyValue'
import { SoldOutStamp } from '../../../shared/ui/SoldOut/SoldOut'
import { Tape } from '../../../shared/ui/Tape/Tape'
import { monthDay } from '../../dashboard/model/dashboardApi'
import { ScenarioInsight } from '../components/ScenarioInsight'
import {
  getSkuDetail,
  type SettingSource,
  type SkuDetail,
} from '../model/skuApi'
import { niceStep, tickText } from '../model/trendScale'
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

// 기획서 계산식: A = 작년 같은 시기 × 올해 최근 흐름, B = 최근 28일 평균. 화면에는 A·B 글자 대신 말로 쓴다.
function methodSentence(method: NonNullable<SkuDetail['method']>) {
  if (method.applied === 'A') return '작년 같은 시기와 최근 흐름으로 계산했어요'
  return method.fallback
    ? '작년 자료가 없어 최근 28일 평균으로 계산했어요'
    : '최근 28일 평균으로 계산했어요'
}

const count = (value: number | null) =>
  value == null ? '—' : `${value.toLocaleString()}개`

// 입고 조건 값(리드타임·발주 주기·입고 단위)이 비었으면 "—일" 대신 "미입력"
const setting = (value: number | null, unit: string) =>
  value == null ? (
    <EmptyValue kind="unset" />
  ) : (
    `${value.toLocaleString()}${unit}`
  )

// 재고·출고 추이 그래프(11/3~4 시안 C): 결론 한 문장을 위에 먼저 쓰고 그래프는 그 증거로 둔다.
// 재고는 선, 출고는 막대, 재고가 0인 날은 빨간 점, 오늘 뒤 "앞으로 N일"은 노란 칸(예상 출고 막대)과
// "이대로 나가면 줄어드는 재고"를 점선으로 그린다. 새 API 없이 마지막 재고와 앞으로 N일 합계로만 계산한다.
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const update = () => setWidth(Math.max(280, Math.round(node.clientWidth)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

const slashDate = (day: string, fallback: string) => {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(day)
  return match ? `${Number(match[1])}/${Number(match[2])}` : fallback
}

const perDayText = (value: number) =>
  value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)

function TrendChart({
  coverDays,
  forecastQty,
  history,
  shortageOn,
  startStock,
}: {
  coverDays: number
  forecastQty: number | null
  history: SkuDetail['history']
  shortageOn: string | null
  startStock: number | null
}) {
  const [wrapRef, width] = useWidth()
  const phone = width < 480
  const height = phone ? 250 : 280
  const box = { left: 44, right: width - 12, top: 30, bottom: height - 48 }

  const future = coverDays > 0 && forecastQty != null ? coverDays : 0
  const daily = future ? (forecastQty ?? 0) / future : 0
  const last = history.at(-1)
  const max = Math.max(...history.map((item) => item.inventory), daily, 1)
  const step = niceStep(max)
  const top = Math.ceil(max / step) * step
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step)

  // 가로는 날짜 간격대로 둔다(기록이 주 단위여도 "앞으로 N일"과 같은 자로 잰다). 날짜를 못 읽으면 순서대로.
  const first = Date.parse(history[0]?.day ?? '')
  const dayAt = (index: number) => {
    const at = Date.parse(history[index]?.day ?? '')
    return Number.isNaN(first) || Number.isNaN(at)
      ? index
      : (at - first) / 864e5
  }
  const lastDay = history.length > 0 ? dayAt(history.length - 1) : 0
  const span = lastDay + future
  const perDay = span > 0 ? (box.right - box.left) / span : 0
  const xd = (day: number) => box.left + day * perDay
  const x = (index: number) => xd(dayAt(index))
  const y = (value: number) =>
    box.bottom - (value / top) * (box.bottom - box.top)
  const gap = history.length > 1 ? (lastDay / (history.length - 1)) * perDay : 0
  const barWidth = Math.min(14, Math.max(gap * 0.35, 4))
  const stockouts = history
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.inventory === 0)
  const todayX = x(history.length - 1)

  // 지금 재고가 하루 평균으로 줄어들면 며칠 뒤 0이 되는지
  const stock = last?.inventory ?? 0
  const daysLeft = daily > 0 ? stock / daily : Infinity
  const runsOut = future > 0 && stock > 0 && daysLeft <= future
  const outDays = Math.max(1, Math.round(daysLeft))
  // 이 값은 "지금"이 아니라 마지막 기록일의 기말 재고다. 문장에 그 날짜를 적고 서버 계산과 다르면 알려 준다.
  const baseDate = last ? slashDate(last.day, last.date) : ''
  const lastMs = Date.parse(last?.day ?? '')
  const outDate =
    Number.isNaN(lastMs) || !Number.isFinite(daysLeft)
      ? null
      : new Date(lastMs + outDays * 864e5)
  const outText = outDate
    ? `${outDate.getUTCMonth() + 1}/${outDate.getUTCDate()}쯤`
    : `약 ${outDays}일 뒤`
  const serverDiffers = startStock != null && startStock !== stock
  const outX = xd(lastDay + daysLeft)
  const zoneWidth = box.right - todayX
  const flip = outX + 78 > box.right

  // 날짜 글자: 점 사이가 좁으면 건너뛰어 겹치지 않게
  const every = Math.max(1, Math.ceil(46 / Math.max(gap, 1)))
  const dateIndexes = history
    .map((_, index) => index)
    .filter((index) => (history.length - 1 - index) % every === 0)

  return (
    <div className={styles.trendChart} ref={wrapRef}>
      {future > 0 && last && (
        <>
          <p className={styles.trendHead}>
            {stock === 0 ? (
              <>
                <em>{baseDate} 기록 기준 재고가 없어요</em> · 하루 약{' '}
                {perDayText(daily)}개씩 나가요
              </>
            ) : runsOut ? (
              <>
                {baseDate} 기록 기준 재고 {stock.toLocaleString()}개 · 하루 약{' '}
                {perDayText(daily)}개씩 나가면 <em>{outText} 바닥나요</em>
              </>
            ) : (
              <>
                {baseDate} 기록 기준 재고 {stock.toLocaleString()}개 · 하루 약{' '}
                {perDayText(daily)}개씩 나가도{' '}
                <em>앞으로 {future}일은 버텨요</em>
              </>
            )}
          </p>
          {serverDiffers && (
            <p className={styles.trendWarn}>
              서버 계산은 시작 재고 {startStock.toLocaleString()}개 기준
              {shortageOn
                ? `이라 ${slashDate(shortageOn, shortageOn)} 소진으로 봐요.`
                : '이에요.'}
            </p>
          )}
          <p className={styles.trendSub}>
            왼쪽은 최근 기록, 노란 칸은 앞으로 {future}일 예상이에요.
          </p>
        </>
      )}
      <svg
        aria-label="최근 재고와 출고 추이 그래프"
        className={styles.chart}
        role="img"
        style={{ height }}
        viewBox={`0 0 ${width} ${height}`}
      >
        <title>최근 재고와 출고 추이</title>
        <text className={styles.unitLabel} x={box.left - 8} y={box.top - 14}>
          개
        </text>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={styles.gridLine}
              x1={box.left}
              x2={box.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className={styles.tick} x={box.left - 8} y={y(tick) + 4}>
              {tickText(tick)}
            </text>
          </g>
        ))}
        {future > 0 && (
          <g>
            <rect
              className={styles.forecastZone}
              height={box.bottom - box.top}
              rx="8"
              width={zoneWidth}
              x={todayX}
              y={box.top}
            />
            <line
              className={styles.todayLine}
              x1={todayX}
              x2={todayX}
              y1={box.top - 6}
              y2={box.bottom + 6}
            />
            <text
              className={styles.forecastLabel}
              x={todayX + zoneWidth / 2}
              y={box.top + 16}
            >
              앞으로 {future}일
            </text>
            {!phone && (
              <text
                className={styles.forecastSum}
                x={todayX + zoneWidth / 2}
                y={box.top + 32}
              >
                합계 약 {count(forecastQty)}
              </text>
            )}
            {Array.from({ length: future }, (_, i) => (
              <rect
                className={styles.forecastBar}
                height={box.bottom - y(daily)}
                key={i}
                width={Math.max(2, perDay * 0.55)}
                x={xd(lastDay + i + 1) - Math.max(2, perDay * 0.55) / 2}
                y={y(daily)}
              />
            ))}
            {!phone && (
              <text
                className={styles.forecastLabel}
                x={todayX + zoneWidth / 2}
                y={y(daily) - 7}
              >
                하루 약 {perDayText(daily)}개
              </text>
            )}
          </g>
        )}
        {history.map((item, index) => (
          <rect
            className={styles.outboundBar}
            height={box.bottom - y(item.outbound)}
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
        {runsOut && last && (
          <>
            <polyline
              className={styles.forecastLine}
              fill="none"
              points={`${todayX},${y(stock)} ${outX},${y(0)}`}
            />
            <line
              className={styles.dropLine}
              x1={outX}
              x2={outX}
              y1={y(0) - 8}
              y2={y(top * 0.5)}
            />
            <text
              className={styles.dropLabel}
              style={flip ? { textAnchor: 'end' } : undefined}
              x={outX + (flip ? -6 : 6)}
              y={y(top * 0.5) + 4}
            >
              약 {outDays}일 뒤
            </text>
            <text
              className={styles.dropLabel}
              style={flip ? { textAnchor: 'end' } : undefined}
              x={outX + (flip ? -6 : 6)}
              y={y(top * 0.5) + 19}
            >
              바닥
            </text>
            <circle className={styles.zeroPoint} cx={outX} cy={y(0)} r="6" />
          </>
        )}
        {stockouts.map(({ item, index }) => (
          <circle
            className={styles.zeroPoint}
            cx={x(index)}
            cy={box.bottom}
            key={item.date}
            r="6"
          />
        ))}
        {future > 0 && last && stock > 0 && (
          <circle
            className={styles.todayPoint}
            cx={todayX}
            cy={y(last.inventory)}
            r="5.5"
          />
        )}
        {stockouts.length > 0 && (
          <text
            className={styles.stockoutLabel}
            x={x(stockouts[Math.floor(stockouts.length / 2)].index)}
            y={box.bottom - 12}
          >
            품절 {stockouts.length}일
          </text>
        )}
        {dateIndexes.map((index) => (
          <text
            className={
              index === history.length - 1 && future > 0
                ? styles.dateToday
                : styles.dateLabel
            }
            key={history[index].date}
            x={x(index)}
            y={box.bottom + 20}
          >
            {slashDate(history[index].day, history[index].date)}
          </text>
        ))}
        {future > 0 && (
          <>
            <text className={styles.dateToday} x={todayX} y={box.bottom + 37}>
              마지막 기록
            </text>
            <text
              className={styles.dateLabel}
              style={{ textAnchor: 'end' }}
              x={box.right}
              y={box.bottom + 20}
            >
              +{future}일
            </text>
          </>
        )}
      </svg>
      <div className={styles.trendLegend}>
        <span data-series="inventory">재고(선)</span>
        <span data-series="outbound">
          {future > 0
            ? phone
              ? '지난 출고(막대)'
              : '지난 하루 출고(막대)'
            : '출고(막대)'}
        </span>
        {future > 0 && (
          <span data-series="forecast">
            {phone ? '예상 출고(노란 막대)' : '예상 하루 출고(노란 막대)'}
          </span>
        )}
        {runsOut && (
          <span data-series="drop">
            {phone ? '줄어드는 재고' : '이대로면 줄어드는 재고'}
          </span>
        )}
        <span data-series="stockout">재고 0(품절)</span>
      </div>
    </div>
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

// 권장 입고량이 0에서 올라가며 나타난다(0.7초, ease-out). 움직임 줄이기 설정이나 확인 못 하는 환경에서는 바로 값을 보여 준다.
const canAnimate = () =>
  typeof window.matchMedia === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(() => (canAnimate() ? 0 : value))

  useEffect(() => {
    if (!canAnimate()) return
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min((now - start) / 700, 1)
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <>{(canAnimate() ? shown : value).toLocaleString()}</>
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
        loader={<BoxLoader title="상품" />}
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
  // 예상 소진일이 오늘보다 앞이면 "품절 주의"(대시보드 표와 같은 기준). 품절은 확인 못 했으니 단정하지 않는다
  const stockoutPassed =
    data.shortageOn !== null && data.shortageOn < localIsoToday()
  const statusLabel = {
    ready: '계산 완료',
    reference: '참고용',
    unavailable: data.reuploadRequired ? '최신 자료 필요' : '계산 불가',
    pending: '계산 전',
  }[data.status]
  const settingRows = (
    <dl className={styles.evidence}>
      <div>
        <dt>리드타임</dt>
        <dd>
          {setting(data.settings.leadTimeDays, '일')}
          {data.settings.leadTimeDays != null && (
            <span className={styles.source}>
              {sourceLabels[data.settings.leadTimeSource]}
            </span>
          )}
        </dd>
      </div>
      <div>
        <dt>발주 주기</dt>
        <dd>
          {setting(data.settings.reviewCycleDays, '일')}
          {data.settings.reviewCycleDays != null && (
            <span className={styles.source}>
              {sourceLabels[data.settings.reviewCycleSource]}
            </span>
          )}
        </dd>
      </div>
    </dl>
  )
  // 사장님이 넣을 값이 하나라도 비었으면 고치는 곳으로 가는 길을 붙인다
  const settingsMissing =
    data.settings.leadTimeDays == null ||
    data.settings.reviewCycleDays == null ||
    data.settings.orderUnitQty == null
  const settingsLink = settingsMissing && (
    <Link className={styles.fixLink} to="/settings">
      입고 조건에서 정하기 →
    </Link>
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          {/* 출고지는 없으면 줄째 뺀다 */}
          {data.fulfillment && (
            <span className={styles.eyebrow}>{data.fulfillment}</span>
          )}
          <div className={styles.title}>
            <h1>{data.name}</h1>
            {stockoutPassed && <SoldOutStamp />}
          </div>
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
          {settingsLink}
        </section>
      ) : data.status === 'unavailable' ? (
        <AsyncState
          description={calculationReason(
            data.unavailableReason ??
              '판매 기록이 더 쌓이면 권장 입고량을 계산할 수 있어요.',
          )}
          status="empty"
          title={
            data.reuploadRequired
              ? '최신 수불부가 필요해요'
              : '아직 계산할 데이터가 부족해요'
          }
          onRetry={
            data.reuploadRequired ? () => navigate('/upload') : undefined
          }
          retryLabel="수불부 다시 올리기"
        >
          {data.unavailableReason && (
            <ReasonDetail reason={data.unavailableReason} />
          )}
        </AsyncState>
      ) : (
        <>
          {stockoutPassed && data.shortageOn && (
            <aside className={styles.soldBanner}>
              {monthDay(data.shortageOn)}에 재고가 바닥났을 수 있어요 · 권장{' '}
              {data.recommendation.quantity.toLocaleString()}개를 지금 넣어
              주세요
            </aside>
          )}
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
              <strong
                aria-label={`권장 입고량 ${data.recommendation.quantity.toLocaleString()}개`}
                className={styles.recoQty}
              >
                <Tape className={styles.recoTape} />
                <span aria-hidden="true" className={styles.recoNum}>
                  <CountUp value={data.recommendation.quantity} />
                  <small className={styles.recoUnit}>개</small>
                </span>
              </strong>
            </div>
            <dl>
              <div>
                <dt>예상 사입비</dt>
                <dd>
                  {data.recommendation.cost == null ? (
                    <Link className={styles.fixLink} to="/settings">
                      단가를 넣으면 보여요 →
                    </Link>
                  ) : (
                    `${data.recommendation.cost.toLocaleString()}원`
                  )}
                </dd>
              </div>
              <div>
                <dt>현재 예상 소진일</dt>
                <dd>
                  {data.recommendation.expectedStockoutDate ?? (
                    <EmptyValue kind="short" />
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <div className={styles.mainGrid}>
            <section className={styles.card}>
              <div className={styles.sectionHeader}>
                <h2>재고·출고 추이</h2>
              </div>
              {data.history.length > 0 ? (
                <TrendChart
                  coverDays={data.calculation.coverDays}
                  forecastQty={data.calculation.forecastQty}
                  history={data.history}
                  shortageOn={data.shortageOn}
                  startStock={data.calculation.startingInventory}
                />
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
                <p className={styles.methodSentence}>
                  {methodSentence(data.method)}
                  {!data.method.fallback && (
                    <small>기본 계산 방식을 적용했어요</small>
                  )}
                </p>
              )}
              <ol className={styles.steps}>
                <li>
                  <span aria-hidden="true" className={styles.stepOp} />
                  <span>앞으로 {data.calculation.coverDays}일 예상 출고</span>
                  <strong>{count(data.calculation.forecastQty)}</strong>
                </li>
                <li>
                  <span aria-hidden="true" className={styles.stepOp}>
                    ×
                  </span>
                  <span>여유 배수</span>
                  <strong>{data.calculation.multiplier}배</strong>
                </li>
                <li>
                  <span aria-hidden="true" className={styles.stepOp}>
                    −
                  </span>
                  <span>
                    시작 재고
                    {data.calculation.startingInventoryEstimated && (
                      <small> 추정</small>
                    )}
                  </span>
                  <strong>
                    {data.calculation.startingInventory == null ? (
                      <EmptyValue kind="short" />
                    ) : (
                      count(data.calculation.startingInventory)
                    )}
                  </strong>
                </li>
                {Boolean(data.calculation.existingOrders) && (
                  <li>
                    <span aria-hidden="true" className={styles.stepOp}>
                      −
                    </span>
                    <span>기존 발주</span>
                    <strong>{count(data.calculation.existingOrders)}</strong>
                  </li>
                )}
                {/* 셀러가 꼭 봐야 하는 줄: 입고가 오기 전에 이미 놓치는 주문. 노란 느낌표로 강조 */}
                {Boolean(data.calculation.preArrivalUnmet) && (
                  <li className={styles.stepWarn}>
                    <span aria-hidden="true" className={styles.stepOp}>
                      −
                    </span>
                    <span>
                      <b className={styles.warnLabel}>
                        <span aria-hidden="true" className={styles.warnMark}>
                          !
                        </span>
                        도착 전에 못 파는 양
                      </b>
                      <small>입고가 오기 전에 이미 놓친 주문이라 빼요</small>
                    </span>
                    <strong>{count(data.calculation.preArrivalUnmet)}</strong>
                  </li>
                )}
                {data.calculation.rawQuantity != null && (
                  <li className={styles.stepSum}>
                    <span aria-hidden="true" className={styles.stepOp}>
                      =
                    </span>
                    <span>필요한 양</span>
                    <strong>
                      {data.calculation.rawQuantity.toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                      개
                    </strong>
                  </li>
                )}
                <li className={styles.stepFinal}>
                  <span aria-hidden="true" className={styles.stepOp}>
                    ↑
                  </span>
                  <span>
                    {data.calculation.inboundUnit == null
                      ? '입고 단위로 올림'
                      : `입고 단위 ${data.calculation.inboundUnit}개로 올림`}
                    <small>
                      권장 입고량
                      {data.calculation.inboundUnit == null && (
                        <>
                          {' '}
                          · 입고 단위 <EmptyValue kind="unset" />
                        </>
                      )}
                    </small>
                  </span>
                  <strong>{count(data.recommendation.quantity)}</strong>
                </li>
              </ol>
              <p className={styles.leadTime}>
                리드타임 {setting(data.settings.leadTimeDays, '일')}
                {data.settings.leadTimeDays != null && (
                  <span className={styles.source}>
                    {sourceLabels[data.settings.leadTimeSource]}
                  </span>
                )}
              </p>
              {settingsLink}
            </section>
          </div>

          {data.resultId !== null && (
            <ScenarioInsight
              inboundUnit={data.calculation.inboundUnit ?? 1}
              key={data.resultId}
              resultId={data.resultId}
            />
          )}

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
  const evaluated =
    (coverTrials ?? 0) > 0 && coverSuccess != null && errorRate != null
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
        <span
          className={styles.accuracyGrade}
          data-grade={accuracy.grade ?? 'none'}
        >
          {evaluated && accuracy.grade
            ? `정확도 ${accuracyLabels[accuracy.grade]}`
            : '실제 정확도 미평가'}
        </span>
      </div>
      <div className={styles.accuracyBoxes}>
        <div data-tone="cover">
          <span>커버 성공률</span>
          <strong>
            {coverRate == null ? <EmptyValue kind="short" /> : `${coverRate}%`}
          </strong>
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
          <strong>
            {errorRate == null ? <EmptyValue kind="short" /> : `${errorRate}%`}
          </strong>
          {errorRate != null && (
            <span aria-hidden="true" className={styles.bar}>
              <i style={{ width: `${Math.min(errorRate, 100)}%` }} />
            </span>
          )}
          <p>
            {errorRate == null
              ? '비교할 지난 예측이 쌓이면 보여요.'
              : '예측이 실제 출고와 평균 이만큼 빗나갔어요. 낮을수록 좋아요.'}
          </p>
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
          <div className={styles.legend} role="group" aria-label="그래프 범례">
            <span data-series="actual">실제 출고량</span>
            <span data-series="prediction">예측 출고량</span>
          </div>
          <AccuracyChart history={accuracy.history} />
        </>
      )}
    </section>
  )
}

function localIsoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
