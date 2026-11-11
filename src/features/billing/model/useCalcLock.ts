import { calcLock } from './billing'
import { useSubscription } from './billingApi'

// 지금 새 계산을 막아야 하나(#214). 구독을 받아 오기 전이거나 결제가 꺼져 있으면(서버 503) 막지 않는다.
export function useCalcLock() {
  const { data } = useSubscription()
  return data ? calcLock(data) : null
}
