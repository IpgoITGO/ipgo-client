import { useQuery } from '@tanstack/react-query'

import { Button } from '../../../shared/ui/Button/Button'
import {
  currentCalculation,
  isStale,
  usePlannedMutation,
  usePlannedQuery,
} from '../model/plannedQuantity'
import styles from './DecideRecommended.module.css'

// 상품 이름 줄 오른쪽의 "N개로 정하기"(11/16). 이 화면의 노란 주요 버튼은 이것 하나.
// 비교 카드의 권장량 "이 수량으로 정하기"와 같은 일을 하고(같은 내 입고량 자료), 정한 뒤에는 그 카드처럼 "되돌리기"로 바뀐다.
// 버튼 폭을 고정해 글자가 바뀌어도 옆의 상태 칩이 움직이지 않는다.
export function DecideRecommended({
  productId,
  quantity,
  resultId,
}: {
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
  const decided = !!plan && !stale && plan.quantity === quantity
  return (
    <Button
      className={styles.decide}
      disabled={mutation.isPending || !plannedQuery.isSuccess}
      onClick={() =>
        mutation.mutate(decided ? null : { quantity, source: 'SCENARIO_100' })
      }
      variant={decided ? 'secondary' : 'primary'}
    >
      {decided ? '되돌리기' : `${quantity.toLocaleString()}개로 정하기`}
    </Button>
  )
}
