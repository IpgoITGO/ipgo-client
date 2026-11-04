import { useQuery } from '@tanstack/react-query'

import { Button } from '../../../shared/ui/Button/Button'
import { Tape } from '../../../shared/ui/Tape/Tape'
import {
  failText,
  getInsight,
  getScenarios,
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
const HIGH_RISK = 20

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

// AI 인사이트 카드. 오른쪽에 같은 계산값을 손그림으로 요약한다(입고량 비교 카드는 11/4 결정으로 이 그림이 대신한다).
export function ScenarioInsight({
  resultId,
}: {
  // K1 상세의 result.resultId. 시나리오·인사이트는 계산 결과 아래에 붙는다(ERD).
  resultId: number | string
}) {
  const scenariosQuery = useQuery({
    queryKey: ['result', resultId, 'scenarios'],
    queryFn: () => getScenarios(resultId),
  })
  const insightQuery = useQuery({
    queryKey: ['result', resultId, 'insight'],
    queryFn: () => getInsight(resultId),
  })

  const insight = insightQuery.data
  const insightTone = insightQuery.isPending
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
        ? '숫자는 오른쪽 그림에 계산값 그대로 있어요'
        : 'AI 대신 미리 정해 둔 기본 문장이에요' +
          (insight?.failReason ? ` · ${failText(insight.failReason)}` : '')

  // 그림 숫자: 권장량(P100)과 80%(P80) 시나리오. 권장량이 0이거나 시나리오를 못 받으면 그림을 빼고 문장만 둔다.
  const data = scenariosQuery.data && toScenarios(scenariosQuery.data)
  const recommended = data?.scenarios.find((item) => item.id === 'P100')
  const lower = data?.scenarios.find((item) => item.id === 'P80')
  const sketch: SketchValues | null =
    recommended && recommended.quantity > 0
      ? {
          recommended: recommended.quantity,
          preRisk: recommended.preArrivalRisk,
          postRisk: recommended.postArrivalRisk,
          endRecommended: recommended.remainingAtNextInbound,
          lower: lower
            ? { quantity: lower.quantity, end: lower.remainingAtNextInbound }
            : null,
        }
      : null

  return (
    <div className={styles.wrapper}>
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
          {insightQuery.isPending ? (
            <div className={styles.writing} role="status">
              <img alt="" height="36" src="/logo.png" width="36" />
              <b>계산 결과를 읽고 정리하는 중이에요</b>
              <i />
              <i />
              <p>오른쪽 그림의 숫자는 지금 바로 볼 수 있어요.</p>
            </div>
          ) : insightQuery.isError ? (
            <div className={styles.failed} role="alert">
              <img alt="" height="36" src="/logo.png" width="36" />
              <b>설명 문장을 불러오지 못했어요</b>
              <p>오른쪽 그림의 숫자는 그대로 맞아요.</p>
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
                  <li data-tone="danger">
                    <span>설명 문장을 만들지 못했어요.</span>
                  </li>
                  <li>
                    <span>
                      오른쪽 그림에서 권장량을 넣었을 때 남는 재고와 품절 위험을
                      확인해 주세요.
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
