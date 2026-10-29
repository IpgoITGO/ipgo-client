import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useCallback, useState } from 'react'

import { apiRequest } from '../../../shared/api/client'
import { useActionLock } from '../../../shared/hooks/useActionLock'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { Button } from '../../../shared/ui/Button/Button'
import { Tape } from '../../../shared/ui/Tape/Tape'
import styles from './ScenarioInsight.module.css'

type Scenario = {
  id: string
  label: string
  quantity: number
  expectedStockoutDate: string
  remainingAtNextInbound: number
  preArrivalRisk: number | null
  postArrivalRisk: number | null
  estimated: boolean
  sampleSize: number
}

type ScenarioResponse = {
  recommendedQuantity: number
  scenarios: Scenario[]
}

type InsightResponse = {
  source: 'ai' | 'fallback'
  message: string
}

// 품절 위험이 이 값 이상이면 빨간 글씨로 강조한다.
const ROW_SIZE = 5
const HIGH_RISK = 20

function formatRisk(risk: number | null) {
  return risk === null ? '표본 부족으로 미산출' : `${risk}%`
}

// AI 문장을 문장 단위로 나눈다. (마침표·물음표 뒤 공백 기준)
function splitSentences(message: string) {
  return message
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
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

export function ScenarioInsight({
  inboundUnit,
  skuId,
}: {
  inboundUnit: number
  skuId: string
}) {
  const [quantity, setQuantity] = useState('')
  const [customScenarios, setCustomScenarios] = useState<Scenario[]>([])
  const [inputError, setInputError] = useState('')
  const [actionError, setActionError] = useState('')
  // "+" 카드를 눌러 입력 중인지, 한 줄(5칸)을 넘는 카드를 펼쳤는지
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const scenariosQuery = useQuery({
    queryKey: ['sku', skuId, 'scenarios'],
    queryFn: () => apiRequest<ScenarioResponse>(`/skus/${skuId}/scenarios`),
  })
  const insightQuery = useQuery({
    queryKey: ['sku', skuId, 'insight'],
    queryFn: () => apiRequest<InsightResponse>(`/skus/${skuId}/insight`),
  })

  const calculate = useCallback(
    async (inputQuantity: number) => {
      setActionError('')
      try {
        const scenario = await apiRequest<Scenario>(
          `/skus/${skuId}/scenarios`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: inputQuantity }),
          },
        )
        // 직접 넣은 수량은 여러 개 쌓아 비교한다. 같은 수량을 다시 넣으면 새 값으로 바꾼다.
        setCustomScenarios((current) => [
          ...current.filter((item) => item.quantity !== scenario.quantity),
          { ...scenario, id: `custom-${scenario.quantity}` },
        ])
        setQuantity('')
        setAdding(false)
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : '시나리오를 계산하지 못했어요.',
        )
      }
    },
    [skuId],
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

  const data = scenariosQuery.data
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
  // 한 줄에 5칸("+" 카드 포함). 넘치면 처음 5개만 보이고 나머지는 "더 보기"로 편다.
  const overflow = scenarios.length + 1 > ROW_SIZE
  const showAll = expanded || !overflow
  const visible = showAll ? scenarios : scenarios.slice(0, ROW_SIZE)
  const hiddenCount = scenarios.length - visible.length
  // 권장량이 0이라 카드가 없으면 처음부터 입력칸을 연다.
  const showInput = adding || scenarios.length === 0
  const maxRisk = Math.max(
    ...scenarios.map((item) => item.postArrivalRisk ?? 0),
    1,
  )

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
            <div className={styles.cards}>
              {visible.map((scenario) => {
                const recommended =
                  !isCustom(scenario) &&
                  scenario.quantity === data?.recommendedQuantity
                const note = scenarioNote(
                  scenario,
                  data?.recommendedQuantity ?? 0,
                )
                return (
                  <article
                    className={styles.scenario}
                    data-custom={isCustom(scenario)}
                    data-recommended={recommended}
                    key={scenario.id}
                  >
                    <div className={styles.scenarioTop}>
                      <span>{scenario.label}</span>
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
                      {sharedPreArrivalRisk === undefined && (
                        <div>
                          <dt>도착 전 품절 위험</dt>
                          <dd>{formatRisk(scenario.preArrivalRisk)}</dd>
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
                    <p className={styles.note}>{note}</p>
                  </article>
                )
              })}

              {showAll && !showInput && (
                <button
                  className={styles.addCard}
                  onClick={() => setAdding(true)}
                  type="button"
                >
                  <span aria-hidden="true">+</span>
                  수량 넣어 비교
                </button>
              )}

              {showAll && showInput && (
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
                    loading={action.isPending}
                    loadingLabel="계산 중"
                    type="submit"
                    variant="secondary"
                  >
                    비교에 추가
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
                      입고 단위 {inboundUnit}개로 올려서 계산해요
                    </p>
                  )}
                </form>
              )}
            </div>
            {overflow && (
              <div className={styles.more}>
                {expanded ? (
                  <Button
                    onClick={() => {
                      setExpanded(false)
                      setAdding(false)
                    }}
                    variant="text"
                  >
                    접기
                  </Button>
                ) : (
                  <>
                    {hiddenCount > 0 && (
                      <Button onClick={() => setExpanded(true)} variant="text">
                        더 보기 {hiddenCount}개
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        setExpanded(true)
                        setAdding(true)
                      }}
                      variant="secondary"
                    >
                      + 수량 넣어 비교
                    </Button>
                  </>
                )}
              </div>
            )}
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

      {/* AI 인사이트: 다른 카드와 같은 흰 카드에 테이프. AI가 쓴 글임을 라벨로 드러내고, 문장이 한 줄씩 써지듯 나타난다. */}
      <section className={styles.insight}>
        <Tape className={styles.insightTape} />
        <div className={styles.insightHead}>
          <h2>
            <span aria-hidden="true" className={styles.spark}>
              ✦
            </span>
            AI 인사이트
          </h2>
          {insightQuery.isSuccess && insightQuery.data.source === 'ai' ? (
            <span className={styles.source} data-source="ai">
              AI 생성
            </span>
          ) : (
            !insightQuery.isPending && (
              <span className={styles.source} data-source="fallback">
                기본 문장
              </span>
            )
          )}
          <small>계산 결과를 읽고 정리했어요 · 숫자는 계산값 그대로</small>
        </div>
        {insightQuery.isPending ? (
          <AsyncState
            description="비교표의 숫자를 바탕으로 핵심 내용을 정리하고 있어요."
            status="loading"
            title="인사이트 생성 중"
          />
        ) : (
          <ol className={styles.lines}>
            {splitSentences(
              insightQuery.isError
                ? '권장 입고량과 도착 전 품절 위험을 비교해 발주 수량을 결정해 주세요.'
                : insightQuery.data.message,
            ).map((sentence, index) => (
              <li
                key={sentence}
                style={{ animationDelay: `${250 + index * 450}ms` }}
              >
                {/* 한 덩어리로 감싸야 번호 칸 옆 한 칸에 문장이 이어진다 */}
                <span>{highlightNumbers(sentence)}</span>
              </li>
            ))}
          </ol>
        )}
        <p className={styles.basis}>근거: 위 입고량 시나리오 표</p>
      </section>
    </div>
  )
}
