import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useCallback, useMemo, useState } from 'react'

import { ApiError } from '../../../shared/api/client'
import { useActionLock } from '../../../shared/hooks/useActionLock'
import { shortExpiry, useExpiry } from '../../expiry/model/expiryApi'
import {
  monthlyStorageCost,
  useStorageSettings,
} from '../../settings/model/storageCost'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { Button } from '../../../shared/ui/Button/Button'
import { Tape } from '../../../shared/ui/Tape/Tape'
import {
  isOwnPlan,
  isStale,
  type PlannedSource,
  usePlannedMutation,
  usePlannedQuery,
  currentCalculation,
  shortBasis,
  shortDate,
} from '../model/plannedQuantity'
import {
  addCustomScenario,
  failText,
  getInsight,
  getScenarios,
  type Scenario,
  toScenario,
  toScenarios,
} from '../model/resultApi'
import { InsightSketch, type SketchValues } from './InsightSketch'
import styles from './ScenarioInsight.module.css'

// 테이프·✦ 색: AI 문장 노랑, 기본 문장·갱신 전 회색, 비교표만·오류 빨강
const TONE = { LLM: 'ai', TEMPLATE: 'template', NONE: 'none' } as const
const STATE_CHIP = {
  CHECK_NEEDED: { label: '확인 필요', tone: 'warning' },
  ON_HOLD: { label: '판단 보류', tone: 'muted' },
  NOT_NEEDED: { label: '입고 불필요', tone: 'info' },
  NOT_CALCULABLE: { label: '계산 불가', tone: 'danger' },
} as const

// 품절 위험이 이 값 이상이면 빨간 글씨로 강조한다.
// 서버 NeedJudgment.MAX_DAYS_SINCE_AS_OF와 같은 7일(넘으면 직접 수량 비교를 SCENARIO_STALE로 거절)
const SCENARIO_MAX_DAYS = 7
const STALE_TEXT =
  '지금은 비교가 막혀 있어요\n이 결과 뒤에 새 계산이 있었어요\n수량 정하기는 바로 돼요'

// "2026. 10. 14" → 오늘까지 며칠
function daysSinceDot(dotted: string) {
  const match = dotted.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (!match) return null
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const base = Date.UTC(+match[1], +match[2] - 1, +match[3])
  return Math.round((today - base) / 864e5)
}

// "2026. 12. 1"·"2026-12-01" → 하루 단위 숫자
function dayNum(date: string) {
  const m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(date)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN
}
const HIGH_RISK = 20

function formatRisk(risk: number | null) {
  return risk === null ? '표본 부족으로 미산출' : `${risk}%`
}

// 문장 속 숫자(72개, 8%, 129,600원 등)만 형광펜으로 칠한다. 위험 20% 이상은 빨강.
function highlightNumbers(sentence: string) {
  return sentence.split(/(\d[\d,.]*\s?(?:개|%|일|원)?)/).map((part, index) => {
    if (index % 2 === 0) return part
    const risky = part.endsWith('%') && Number.parseFloat(part) >= HIGH_RISK
    return (
      <mark
        className={styles.mark}
        data-tone={risky ? 'danger' : undefined}
        key={index}
      >
        {part}
      </mark>
    )
  })
}

// 권장량보다 적으면 언제 떨어지는지, 많으면 재고가 남는다는 걸 한 줄로 알려준다.
function scenarioNote(scenario: Scenario, recommendedQuantity: number) {
  if (scenario.quantity < recommendedQuantity) {
    return `예상 소진일 ${scenario.expectedStockoutDate}`
  }
  if (scenario.quantity === recommendedQuantity) return '다음 입고까지 버텨요'
  return '재고가 많이 남아요'
}

const PLAN_NOTE: Record<PlannedSource, string> = {
  SCENARIO_80: '권장량의 80% 카드에서 정함',
  SCENARIO_100: '권장량 그대로 정함',
  SCENARIO_120: '권장량의 120% 카드에서 정함',
  MANUAL: '직접 넣은 수량으로 정함',
}
const SCENARIO_SOURCE: Record<string, PlannedSource> = {
  P80: 'SCENARIO_80',
  P100: 'SCENARIO_100',
  P120: 'SCENARIO_120',
}

export function ScenarioInsight({
  baseDate,
  inboundUnit,
  leadTime,
  productId,
  resultId,
  surge,
}: {
  /** 대시보드 "기준일"과 같은 글자. 내 입고량이 어느 계산에서 나왔는지 가른다 */
  baseDate: string
  inboundUnit: number
  /** 새로 넣는 물건이 언제 도착하는지(유통기한 검사) */
  leadTime?: number | null
  productId: string
  // K1 상세의 result.resultId. 시나리오·인사이트는 계산 결과 아래에 붙는다(ERD).
  resultId: number | string
  /** 판매 급증(11/12): 최근 하루 판매로 다음 입고까지 버틸 수량 카드. 서버 demandShift(#193) */
  surge?: {
    ratio: number
    recent: number
    baseline: number
    quantity: number
  } | null
}) {
  // 서버는 기준일이 7일 넘게 지난 계산에는 직접 수량 비교를 받지 않는다(SCENARIO_STALE) → 누르기 전에 알린다
  const tooOld = (daysSinceDot(baseDate) ?? 0) > SCENARIO_MAX_DAYS
  const [quantity, setQuantity] = useState('')
  const [customScenarios, setCustomScenarios] = useState<Scenario[]>([])
  const [inputError, setInputError] = useState('')
  const [actionError, setActionError] = useState('')
  // "+" 카드를 눌러 입력 중인지, 한 줄(5칸)을 넘는 카드를 펼쳤는지
  const [adding, setAdding] = useState(false)
  // 눌러서 고른 카드(처음엔 권장량)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const plannedQuery = usePlannedQuery()
  const plan = plannedQuery.data?.[productId]
  const plannedMutation = usePlannedMutation(productId, resultId)
  const basisQuery = useQuery({
    queryKey: ['planned-basis', productId, resultId],
    queryFn: () => currentCalculation(productId, resultId),
    enabled: plannedQuery.isSuccess && !!plan,
  })
  const planBusy = plannedMutation.isPending || !plannedQuery.isSuccess

  const scenariosQuery = useQuery({
    queryKey: ['result', resultId, 'scenarios'],
    queryFn: () => getScenarios(resultId),
  })
  const insightQuery = useQuery({
    queryKey: ['result', resultId, 'insight'],
    queryFn: () => getInsight(resultId),
    refetchInterval: (query) =>
      query.state.data?.generating && !query.state.error ? 2000 : false,
  })

  const insight = insightQuery.data
  const insightPending =
    insightQuery.isPending || (insight?.generating && !insightQuery.isError)
  const insightTone = insightPending
    ? 'ai'
    : insightQuery.isError
      ? 'none'
      : insight?.stale
        ? 'template'
        : TONE[insight?.mode ?? 'LLM']
  const stateChip =
    insight && insight.state !== 'NORMAL' ? STATE_CHIP[insight.state] : null
  const insightFoot = insight?.stale
    ? '지난 계산 기준 문장이에요'
    : insight?.mode === 'LLM'
      ? 'AI가 계산 결과를 읽고 정리했어요 · 숫자는 계산값 그대로'
      : insight?.mode === 'NONE'
        ? '숫자는 위 표에 그대로 있어요'
        : 'AI 대신 미리 정해 둔 기본 문장이에요' +
          (insight?.failReason ? ` · ${failText(insight.failReason)}` : '')

  const calculate = useCallback(
    async (inputQuantity: number) => {
      setActionError('')
      try {
        const item = await addCustomScenario(resultId, inputQuantity)
        // 도착 전 위험·표본은 K2 응답에 하나만 오므로 직접 입력 카드도 그 값을 같이 쓴다.
        const scenario = toScenario(
          item,
          scenariosQuery.data ?? {
            isEstimate: true,
            preArrivalRisk: null,
            riskSampleSize: null,
          },
        )
        // 직접 넣은 수량은 화면에서 여러 개 쌓아 비교한다(서버는 마지막 1개만 저장). 같은 수량이면 새 값으로 바꾼다.
        setCustomScenarios((current) => [
          ...current.filter(
            (existing) => existing.quantity !== scenario.quantity,
          ),
          scenario,
        ])
        setQuantity('')
        setAdding(false)
      } catch (error) {
        setActionError(
          error instanceof ApiError && error.code === 'SCENARIO_STALE'
            ? STALE_TEXT
            : error instanceof Error
              ? error.message
              : '시나리오를 계산하지 못했어요.',
        )
      }
    },
    [resultId, scenariosQuery.data],
  )
  const action = useActionLock(calculate)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = Number(quantity)

    if (!Number.isInteger(parsed) || parsed < 1) {
      setInputError('1개 이상의 정수를 입력해 주세요.')
      return
    }

    setInputError('')
    void action.run(parsed)
  }

  const data = scenariosQuery.data && toScenarios(scenariosQuery.data)
  const stale = plan
    ? basisQuery.isError ||
      (basisQuery.isSuccess && isStale(plan, basisQuery.data))
    : false
  const recommendedNow = data?.recommendedQuantity ?? 0
  const decide = (qty: number, source: PlannedSource) =>
    plannedMutation.mutate({ quantity: qty, source })
  const typed = Number(quantity)
  const typedValid =
    quantity.trim() !== '' && Number.isInteger(typed) && typed > 0
  // 입고 전에 이미 못 파는 양(K2 맨 위, server #85)
  const preArrivalUnmet = data?.preArrivalUnmet ?? 0
  const scenarios = data
    ? [
        ...(data.recommendedQuantity === 0 ? [] : data.scenarios),
        ...customScenarios,
      ]
    : []
  const preArrivalRisks = new Set(scenarios.map((item) => item.preArrivalRisk))
  // 도착 전 위험은 입고량과 상관없어 보통 모두 같다. 같으면 위에 한 번만 쓴다.
  const sharedPreArrivalRisk =
    preArrivalRisks.size === 1 ? scenarios[0].preArrivalRisk : undefined
  const isCustom = (scenario: Scenario) => scenario.id.startsWith('custom')
  const isSurge = (scenario: Scenario) =>
    !!surge && isCustom(scenario) && scenario.quantity === surge.quantity
  // 권장량보다 많을 때만 "최근 판매 속도라면" 카드를 둔다(적으면 비교할 뜻이 없음)
  const surgeCard =
    !!surge &&
    surge.quantity > (data?.recommendedQuantity ?? 0) &&
    !scenarios.some(isSurge)
  const selected =
    scenarios.find((item) => item.id === selectedId) ??
    scenarios.find(
      (item) => !isCustom(item) && item.quantity === data?.recommendedQuantity,
    ) ??
    scenarios[0]
  // 한 줄 4칸("+" 카드 포함, 11/11). 더 넣으면 "+" 카드가 다음 칸으로 가고 4칸마다 줄이 바뀐다
  const visible = scenarios
  // 보관료·유통기한은 정보가 넘치지 않게 "있을 때만" 한 줄씩(11/11).
  // 보관료: 요율과 이 상품 상자 크기가 다 있을 때만
  const storage = useStorageSettings()
  const monthlyFee = (quantity: number) =>
    monthlyStorageCost(storage.boxes[productId], quantity, storage.ratePerCbm)
  const showFee = scenarios.some((item) => monthlyFee(item.quantity) != null)
  // 유통기한: 이 상품 입고 묶음에서 유통기한 일수(유통기한 − 입고일)를 구해,
  // 지금 넣으면 도착일 + 그 일수까지 다 팔리는지 본다. 묶음 기록이 없으면 안 보인다
  const expiryQuery = useExpiry()
  const freshExpiry = useMemo(() => {
    const lives = (expiryQuery.data?.items ?? [])
      .filter((lot) => String(lot.productId) === productId)
      .map((lot) =>
        lot.receivedOn && lot.expiryDate
          ? dayNum(lot.expiryDate) - dayNum(lot.receivedOn)
          : NaN,
      )
      .filter((days) => days > 0)
    if (lives.length === 0) return null
    const now = new Date()
    const today =
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5
    const day = today + (leadTime ?? 0) + Math.min(...lives)
    const date = new Date(day * 864e5)
    return { day, label: shortExpiry(date.toISOString().slice(0, 10)) }
  }, [expiryQuery.data, productId, leadTime])
  const outlasts = (scenario: Scenario) =>
    freshExpiry != null &&
    dayNum(scenario.expectedStockoutDate) > freshExpiry.day
  const showExpiry = scenarios.some(outlasts)
  // 권장량이 0이라 카드가 없으면 처음부터 입력칸을 연다.
  const showInput = adding || scenarios.length === 0
  // 한 카드라도 입고 뒤에 모자라면 모든 카드에 같은 줄을 넣어 아래 줄(품절 위험 막대)이 나란히 맞게 한다
  const showAfterArrival = scenarios.some(
    (item) => (item.postArrivalUnmet ?? 0) > 0,
  )
  const maxRisk = Math.max(
    ...scenarios.map((item) => item.postArrivalRisk ?? 0),
    1,
  )

  // AI 인사이트 옆 손그림: 권장량(P100)과 80%(P80) 시나리오 값으로 그린다. 권장량이 0이면 그림 없이 문장만.
  const p100 = data?.scenarios.find((item) => item.id === 'P100')
  const p80 = data?.scenarios.find((item) => item.id === 'P80')
  const sketch: SketchValues | null =
    p100 && p100.quantity > 0
      ? {
          recommended: p100.quantity,
          preRisk: p100.preArrivalRisk,
          postRisk: p100.postArrivalRisk,
          endRecommended: p100.remainingAtNextInbound,
          lower: p80
            ? {
                quantity: p80.quantity,
                end: p80.remainingAtNextInbound,
                risk: p80.postArrivalRisk,
              }
            : null,
        }
      : null

  return (
    <div className={styles.wrapper}>
      <section className={styles.card}>
        <div className={styles.header}>
          <div>
            <h2>입고량을 바꾸면 이렇게 달라져요</h2>
            <p>
              {sharedPreArrivalRisk === undefined ||
              sharedPreArrivalRisk === null
                ? '입고량을 바꿨을 때 남는 재고와 품절 위험을 비교해요.'
                : `입고가 도착하기 전 품절 위험은 ${sharedPreArrivalRisk}%로 모든 경우가 같아요.`}
            </p>
          </div>
          {scenarios[0] && (
            <span className={styles.sample}>
              {scenarios[0].estimated ? '추정치' : '계산값'} · 이 상품 기준 ·
              표본 {scenarios[0].sampleSize}일
            </span>
          )}
        </div>

        {(plannedQuery.isError ||
          plannedMutation.isError ||
          basisQuery.isError) && (
          <p role="alert">
            {plannedQuery.error?.message ??
              plannedMutation.error?.message ??
              basisQuery.error?.message}
            <Button
              onClick={() => {
                void plannedQuery.refetch()
                void basisQuery.refetch()
              }}
              variant="text"
            >
              다시 불러오기
            </Button>
          </p>
        )}
        {plannedMutation.isPending && (
          <p role="status">내 입고량을 저장하고 있어요.</p>
        )}
        {scenariosQuery.isPending ? (
          <AsyncState
            description="권장량별 재고 흐름을 계산하고 있어요."
            status="loading"
            title="시나리오 계산 중"
          />
        ) : scenariosQuery.isError ? (
          <AsyncState
            description={scenariosQuery.error.message}
            onRetry={() => void scenariosQuery.refetch()}
            status="error"
            title="시나리오를 불러오지 못했어요"
          />
        ) : (
          <>
            {preArrivalUnmet > 0 && (
              <p className={styles.preArrival}>
                <span aria-hidden="true">!</span>
                입고 전에 이미 {preArrivalUnmet}개는 못 팔아요. 아래 숫자는 입고
                뒤에 모자라는 양이에요.
              </p>
            )}
            {isOwnPlan(plan) && (
              <p className={styles.plan} data-stale={stale || undefined}>
                {stale ? (
                  <>
                    <span>
                      내 입고량 <b>{plan.quantity.toLocaleString()}개</b> ·{' '}
                      {shortBasis(plan.basis)} 계산 기준이에요.{' '}
                      <b>
                        새 계산의 권장은 {recommendedNow.toLocaleString()}개
                      </b>
                    </span>
                    <Button
                      disabled={planBusy}
                      onClick={() => decide(plan.quantity, plan.source)}
                      variant="secondary"
                    >
                      {plan.quantity.toLocaleString()}개 그대로
                    </Button>
                    <Button
                      disabled={planBusy}
                      onClick={() => decide(recommendedNow, 'SCENARIO_100')}
                      variant="secondary"
                    >
                      {recommendedNow.toLocaleString()}개로 바꾸기
                    </Button>
                  </>
                ) : (
                  <span>
                    이 수량으로 넣어요 <b>{plan.quantity.toLocaleString()}개</b>{' '}
                    · {shortDate(plan.decidedAt)} · {PLAN_NOTE[plan.source]}
                  </span>
                )}
                <Button
                  disabled={planBusy}
                  onClick={() => plannedMutation.mutate(null)}
                  variant="text"
                >
                  되돌리기
                </Button>
              </p>
            )}
            <div
              aria-label="입고량 비교"
              className={styles.cards}
              role="radiogroup"
            >
              {visible.map((scenario) => {
                const recommended =
                  !isCustom(scenario) &&
                  scenario.quantity === data?.recommendedQuantity
                const source = SCENARIO_SOURCE[scenario.id] ?? 'MANUAL'
                const decided =
                  !!plan && !stale && plan.quantity === scenario.quantity
                const note = scenarioNote(
                  scenario,
                  data?.recommendedQuantity ?? 0,
                )
                return (
                  <div
                    aria-checked={selected?.id === scenario.id}
                    className={styles.scenario}
                    data-custom={isCustom(scenario)}
                    data-decided={decided || undefined}
                    data-recommended={recommended}
                    data-selected={selected?.id === scenario.id}
                    key={scenario.id}
                    onClick={() => setSelectedId(scenario.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedId(scenario.id)
                      }
                    }}
                    role="radio"
                    tabIndex={0}
                  >
                    {decided && (
                      <span className={styles.decidedBand}>
                        {source === 'SCENARIO_100'
                          ? '✓ 권장대로 넣어요'
                          : '✓ 이 수량으로 넣어요'}
                      </span>
                    )}
                    {isSurge(scenario) && surge && (
                      <span className={styles.surgeTape}>
                        판매 급증 {Math.round(surge.ratio)}배
                      </span>
                    )}
                    <div className={styles.scenarioTop}>
                      <span>
                        {isSurge(scenario)
                          ? '최근 판매 속도라면'
                          : scenario.label}
                      </span>
                      {recommended && (
                        <span className={styles.badge}>
                          <Tape className={styles.badgeTape} />
                          <b>권장</b>
                        </span>
                      )}
                    </div>
                    <strong className={styles.quantity}>
                      {scenario.quantity.toLocaleString()}개
                    </strong>
                    <dl>
                      <div>
                        <dt>다음 입고 때 남는 재고</dt>
                        <dd
                          data-tone={
                            scenario.quantity >
                            (data?.recommendedQuantity ?? Infinity)
                              ? 'warning'
                              : undefined
                          }
                        >
                          {scenario.remainingAtNextInbound}개
                        </dd>
                      </div>
                      {showAfterArrival && (
                        <div>
                          <dt>입고 뒤 못 채우는 주문</dt>
                          <dd
                            data-tone={
                              (scenario.postArrivalUnmet ?? 0) > 0
                                ? 'danger'
                                : undefined
                            }
                          >
                            {scenario.postArrivalUnmet ?? 0}개
                          </dd>
                        </div>
                      )}
                      {sharedPreArrivalRisk === undefined && (
                        <div>
                          <dt>도착 전 품절 위험</dt>
                          <dd>{formatRisk(scenario.preArrivalRisk)}</dd>
                        </div>
                      )}
                      {showFee && (
                        <div>
                          <dt>월 보관료</dt>
                          <dd>
                            {monthlyFee(scenario.quantity)?.toLocaleString() ??
                              '—'}
                            원
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>도착 후 품절 위험</dt>
                        <dd
                          data-tone={
                            (scenario.postArrivalRisk ?? 0) >= HIGH_RISK
                              ? 'danger'
                              : undefined
                          }
                        >
                          {formatRisk(scenario.postArrivalRisk)}
                        </dd>
                      </div>
                    </dl>
                    <div aria-hidden="true" className={styles.riskBar}>
                      <span
                        style={{
                          width: `${((scenario.postArrivalRisk ?? 0) / maxRisk) * 100}%`,
                        }}
                      />
                    </div>
                    {/* 한 카드라도 걸리면 모든 카드에 같은 자리를 잡아 줄이 나란히 맞는다 */}
                    {showExpiry && (
                      <p
                        className={styles.expiryLine}
                        data-warn={outlasts(scenario) || undefined}
                      >
                        {outlasts(scenario)
                          ? `유통기한 ${freshExpiry?.label} 뒤에도 남아요`
                          : '유통기한 안에 다 팔려요'}
                      </p>
                    )}
                    <p className={styles.note}>{note}</p>
                    <Button
                      className={styles.decideButton}
                      disabled={planBusy}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (decided) plannedMutation.mutate(null)
                        else decide(scenario.quantity, source)
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      type="button"
                      variant="secondary"
                    >
                      {decided ? '되돌리기' : '이 수량으로 정하기'}
                    </Button>
                  </div>
                )
              })}

              {surgeCard && surge && (
                // 옆 카드와 같은 틀·같은 줄: 이름·수량은 같은 자리, 손글씨 비교가 남는 높이를 채워 단추가 옆 카드 단추와 같은 줄에
                <div className={`${styles.scenario} ${styles.surgeCard}`}>
                  <span className={styles.surgeTape}>
                    판매 급증 {Math.round(surge.ratio)}배
                  </span>
                  <div className={styles.scenarioTop}>
                    <span>최근 판매 속도라면</span>
                  </div>
                  <strong className={styles.quantity}>
                    {surge.quantity.toLocaleString()}개
                  </strong>
                  <div className={styles.surgeCompare}>
                    <p>
                      <span className={styles.hand}>{surge.baseline}개</span>
                      <svg aria-hidden="true" viewBox="0 0 44 12">
                        <path d="M2 6 Q20 2 38 6" />
                        <path d="M33 2 L40 6 L33 10" />
                      </svg>
                      <span className={styles.handNow}>{surge.recent}개</span>
                    </p>
                    <p className={styles.surgeCaption}>
                      <span>평소 하루</span>
                      <span>이번 주 하루</span>
                    </p>
                  </div>
                  <p className={styles.note}>
                    최근 7일 속도로 다음 입고까지 버틸 양이에요
                  </p>
                  <Button
                    className={styles.decideButton}
                    disabled={action.isPending || tooOld}
                    onClick={() => void action.run(surge.quantity)}
                    title={tooOld ? STALE_TEXT : undefined}
                    type="button"
                    variant="secondary"
                  >
                    이 수량으로 비교하기
                  </Button>
                </div>
              )}

              {!showInput && (
                <button
                  className={styles.addCard}
                  onClick={() => setAdding(true)}
                  type="button"
                >
                  <span aria-hidden="true">+</span>
                  수량 넣어 비교
                </button>
              )}

              {showInput && (
                <form
                  className={styles.inputCard}
                  noValidate
                  onSubmit={handleSubmit}
                >
                  <label htmlFor="scenario-quantity">직접 입력</label>
                  <div className={styles.inputRow}>
                    <input
                      autoFocus={adding}
                      aria-describedby={
                        inputError ? 'scenario-input-error' : undefined
                      }
                      id="scenario-quantity"
                      inputMode="numeric"
                      min="1"
                      onChange={(event) => setQuantity(event.target.value)}
                      placeholder="수량"
                      type="number"
                      value={quantity}
                    />
                    <span>개</span>
                  </div>
                  {/* 버튼을 칸 너비에 맞춰 두면 "계산 중"으로 글자가 바뀌어도 칸이 흔들리지 않는다. */}
                  <Button
                    className={styles.addButton}
                    disabled={tooOld}
                    loading={action.isPending}
                    loadingLabel="계산 중"
                    type="submit"
                    variant="secondary"
                  >
                    비교에 추가
                  </Button>
                  <Button
                    className={styles.addButton}
                    disabled={planBusy || !typedValid}
                    onClick={() => decide(typed, 'MANUAL')}
                    type="button"
                    variant="secondary"
                  >
                    이 수량으로 정하기
                  </Button>
                  {scenarios.length > 0 && (
                    <Button
                      onClick={() => {
                        setAdding(false)
                        setInputError('')
                        setQuantity('')
                      }}
                      type="button"
                      variant="text"
                    >
                      취소
                    </Button>
                  )}
                  {inputError || actionError ? (
                    <p
                      className={styles.error}
                      id={inputError ? 'scenario-input-error' : undefined}
                      role="alert"
                    >
                      {inputError || actionError}
                    </p>
                  ) : (
                    <p className={styles.hint}>
                      {tooOld
                        ? `기준일(${baseDate})이 7일 넘게 지나 비교 계산은 막혀 있어요. 새 수불부를 올리면 돼요 · "이 수량으로 정하기"는 돼요`
                        : `입고 단위 ${inboundUnit}개로 올려서 계산해요`}
                    </p>
                  )}
                </form>
              )}
            </div>
            {data?.recommendedQuantity === 0 &&
              customScenarios.length === 0 && (
                <p className={styles.empty}>
                  권장량이 0개라 비율 시나리오는 만들지 않았어요. 비교할 수량을
                  직접 입력해 주세요.
                </p>
              )}
          </>
        )}
      </section>

      {/* AI 인사이트: 테이프와 ✦ 색으로 어디서 온 문장인지(AI·기본 문장·비교표만) 먼저 보이고, 맨 아래 한 줄이 이유를 말한다. */}
      <section
        className={styles.insight}
        data-sketch={sketch ? '' : undefined}
        data-tone={insightTone}
      >
        <Tape className={styles.insightTape} />
        <div className={styles.insightMain}>
          <div className={styles.insightHead}>
            <h2>
              <span aria-hidden="true" className={styles.spark}>
                ✦
              </span>
              AI 인사이트
            </h2>
            {stateChip && (
              <span className={styles.state} data-tone={stateChip.tone}>
                {stateChip.label}
              </span>
            )}
          </div>
          {insight?.stateReason && (
            <p className={styles.stateReason}>{insight.stateReason}</p>
          )}
          {insightPending ? (
            <div className={styles.writing} role="status">
              <img alt="" height="36" src="/logo.png" width="36" />
              <b>계산 결과를 읽고 정리하는 중이에요</b>
              <i />
              <i />
              <p>위 시나리오 표는 지금 바로 볼 수 있어요.</p>
            </div>
          ) : insightQuery.isError ? (
            <div className={styles.failed} role="alert">
              <img alt="" height="36" src="/logo.png" width="36" />
              <b>설명 문장을 불러오지 못했어요</b>
              <p>위 시나리오 표의 숫자는 그대로 맞아요.</p>
              <Button
                onClick={() => void insightQuery.refetch()}
                variant="secondary"
              >
                다시 불러오기
              </Button>
            </div>
          ) : (
            <>
              {insight?.stale && (
                <p className={styles.staleNote}>
                  입고 조건이 바뀌었어요. 다시 계산하면 새 설명이 나와요.
                </p>
              )}
              {insight?.mode === 'NONE' ? (
                <ol className={styles.lines} data-numberless="">
                  <li
                    data-tone={
                      insight.explanationDisabled ? undefined : 'danger'
                    }
                  >
                    <span>
                      {insight.explanationDisabled
                        ? 'AI 설명을 사용하지 않고 있어요.'
                        : '설명 문장을 만들지 못했어요.'}
                    </span>
                  </li>
                  <li>
                    <span>
                      위 입고량 시나리오 표에서 수량별 남는 재고와 품절 위험을
                      직접 비교해 주세요.
                    </span>
                  </li>
                </ol>
              ) : (
                <ol
                  className={styles.lines}
                  data-plain={insightTone === 'ai' ? undefined : ''}
                >
                  {insight?.sentences.map((line, index) => (
                    <li
                      key={line}
                      style={{ animationDelay: `${250 + index * 450}ms` }}
                    >
                      {/* 한 덩어리로 감싸야 번호 칸 옆 한 칸에 문장이 이어진다 */}
                      <span>
                        {insightTone === 'ai' ? highlightNumbers(line) : line}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <p className={styles.basis}>{insightFoot}</p>
            </>
          )}
        </div>
        {sketch && <InsightSketch values={sketch} />}
      </section>
    </div>
  )
}
