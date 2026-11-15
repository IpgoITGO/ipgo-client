import { useQuery } from '@tanstack/react-query'

import { Button } from '../../../shared/ui/Button/Button'
import {
  currentCalculation,
  isStale,
  usePlannedMutation,
  usePlannedQuery,
} from '../model/plannedQuantity'
import { getScenarios, toScenarios } from '../model/resultApi'
import { InsightSketch, type SketchValues } from './InsightSketch'

// 상품 상세 맨 위 권장량 카드에 붙는 두 조각(11/15).
// 비교 카드·AI 인사이트와 같은 자료(시나리오, 내 입고량)를 같은 열쇠로 읽어 서버를 더 부르지 않는다.

/** 권장량 옆 손글씨 메모: 권장량(100%)과 80%를 넣었을 때의 차이. 권장량이 0이거나 아직 못 받았으면 없다 */
export function RecoMemo({
  className,
  resultId,
}: {
  className?: string
  resultId: number | string
}) {
  const query = useQuery({
    queryKey: ['result', resultId, 'scenarios'],
    queryFn: () => getScenarios(resultId),
  })
  const data = query.data && toScenarios(query.data)
  const p100 = data?.scenarios.find((item) => item.id === 'P100')
  const p80 = data?.scenarios.find((item) => item.id === 'P80')
  if (!p100 || p100.quantity <= 0) return null
  const values: SketchValues = {
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
  return (
    <aside aria-label="권장량을 넣으면 달라지는 것" className={className}>
      <InsightSketch values={values} />
    </aside>
  )
}

/** 권장량 바로 아래 "N개로 정하기". 이미 정했으면 정한 수량과 되돌리기 */
export function DecideRecommended({
  className,
  productId,
  quantity,
  resultId,
}: {
  className?: string
  productId: string
  quantity: number
  resultId: number | string
}) {
  const plannedQuery = usePlannedQuery()
  const plan = plannedQuery.data?.[productId]
  const mutation = usePlannedMutation(productId, resultId)
  const basisQuery = useQuery({
    queryKey: ['planned-basis', productId, resultId],
    queryFn: () => currentCalculation(productId, resultId),
    enabled: plannedQuery.isSuccess && !!plan,
  })
  if (quantity <= 0) return null
  const stale = plan
    ? basisQuery.isError ||
      (basisQuery.isSuccess && isStale(plan, basisQuery.data))
    : false
  const busy = mutation.isPending || !plannedQuery.isSuccess
  const decided = !!plan && !stale
  return (
    <div className={className} data-decided={decided || undefined}>
      {decided ? (
        <>
          <b>
            <i aria-hidden="true">✓</i> 내 입고량{' '}
            {plan.quantity.toLocaleString()}
            개로 정했어요
          </b>
          <Button
            disabled={busy}
            onClick={() => mutation.mutate(null)}
            variant="text"
          >
            되돌리기
          </Button>
        </>
      ) : (
        <Button
          disabled={busy}
          onClick={() => mutation.mutate({ quantity, source: 'SCENARIO_100' })}
        >
          {quantity.toLocaleString()}개로 정하기
        </Button>
      )}
    </div>
  )
}
