import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useCallback, useState } from 'react'

import { apiRequest } from '../../../shared/api/client'
import { useActionLock } from '../../../shared/hooks/useActionLock'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { Button } from '../../../shared/ui/Button/Button'
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

function formatRisk(risk: number | null) {
  return risk === null ? '표본 부족으로 미산출' : `${risk}%`
}

export function ScenarioInsight({ skuId }: { skuId: string }) {
  const [quantity, setQuantity] = useState('')
  const [customScenarios, setCustomScenarios] = useState<Scenario[]>([])
  const [inputError, setInputError] = useState('')
  const [actionError, setActionError] = useState('')

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
        setCustomScenarios((current) => [
          ...current.filter((item) => item.id !== 'custom'),
          scenario,
        ])
        setQuantity('')
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

  return (
    <div className={styles.wrapper}>
      <section className={styles.card}>
        <div className={styles.header}>
          <div>
            <h2>입고량 시나리오 비교</h2>
            <p>
              입고량을 바꿨을 때 재고와 품절 위험이 어떻게 달라지는지 비교해요.
            </p>
          </div>
          <form className={styles.form} noValidate onSubmit={handleSubmit}>
            <label htmlFor="scenario-quantity">직접 입력</label>
            <input
              aria-describedby={inputError ? 'scenario-input-error' : undefined}
              id="scenario-quantity"
              inputMode="numeric"
              min="1"
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="수량"
              type="number"
              value={quantity}
            />
            <Button
              loading={action.isPending}
              loadingLabel="계산 중"
              type="submit"
              variant="secondary"
            >
              비교 추가
            </Button>
          </form>
        </div>
        {inputError && (
          <p className={styles.error} id="scenario-input-error" role="alert">
            {inputError}
          </p>
        )}
        {actionError && (
          <p className={styles.error} role="alert">
            {actionError}
          </p>
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
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>시나리오</th>
                  <th>입고량</th>
                  <th>예상 소진일</th>
                  <th>다음 입고 시점 재고</th>
                  <th>도착 전 위험</th>
                  <th>도착 후 위험</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...(scenariosQuery.data.recommendedQuantity === 0
                    ? []
                    : scenariosQuery.data.scenarios),
                  ...customScenarios,
                ].map((scenario) => (
                  <tr data-custom={scenario.id === 'custom'} key={scenario.id}>
                    <td>
                      <strong>{scenario.label}</strong>
                      <span>
                        {scenario.estimated ? '추정치' : '계산값'} · 표본{' '}
                        {scenario.sampleSize}일
                      </span>
                    </td>
                    <td>{scenario.quantity.toLocaleString()}개</td>
                    <td>{scenario.expectedStockoutDate}</td>
                    <td>{scenario.remainingAtNextInbound}개</td>
                    <td>{formatRisk(scenario.preArrivalRisk)}</td>
                    <td>{formatRisk(scenario.postArrivalRisk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {scenariosQuery.data.recommendedQuantity === 0 &&
              customScenarios.length === 0 && (
                <p className={styles.empty}>
                  권장량이 0개라 비율 시나리오는 만들지 않았어요. 비교할 수량을
                  직접 입력해 주세요.
                </p>
              )}
          </div>
        )}
      </section>

      <section className={styles.insight}>
        <div className={styles.insightTitle}>
          <span aria-hidden="true">✦</span>
          <h2>AI 인사이트</h2>
        </div>
        {insightQuery.isPending ? (
          <AsyncState
            description="비교표의 숫자를 바탕으로 핵심 내용을 정리하고 있어요."
            status="loading"
            title="인사이트 생성 중"
          />
        ) : insightQuery.isError ? (
          <div>
            <span className={styles.source} data-source="fallback">
              기본 문장
            </span>
            <p>
              권장 입고량과 도착 전 품절 위험을 비교해 발주 수량을 결정해
              주세요.
            </p>
          </div>
        ) : (
          <div>
            <span
              className={styles.source}
              data-source={insightQuery.data.source}
            >
              {insightQuery.data.source === 'ai' ? 'AI 생성' : '기본 문장'}
            </span>
            <p>{insightQuery.data.message}</p>
          </div>
        )}
      </section>
    </div>
  )
}
