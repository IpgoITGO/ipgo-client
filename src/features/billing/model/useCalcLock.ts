import { useSyncExternalStore } from 'react'

import {
  calcLock,
  loadSubscription,
  onSubscriptionChange,
  subscriptionSnapshot,
} from './billing'

// 지금 새 계산을 막아야 하나(#214). 구독이 바뀌면 바로 다시 그린다.
export function useCalcLock() {
  useSyncExternalStore(onSubscriptionChange, subscriptionSnapshot)
  return calcLock(loadSubscription())
}
