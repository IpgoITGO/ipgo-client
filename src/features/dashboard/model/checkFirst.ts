import type { ProductExpiry } from '../../expiry/model/expiryApi'
import { type DemandShift, shiftTimes } from './dashboardApi'

// 권장량을 그대로 믿기 어려운 상품과 그 이유(11/15). 서버를 더 부르지 않고 대시보드가 이미 받은 값으로만 고른다:
// 판매 급변(권장량이 아직 못 따라옴) · 유통기한 지난 재고(팔 수 있는 재고가 실제보다 많게 잡힘).
export type CheckReason = {
  id: string
  name: string
  /** 이유 한 마디. 진하게 보일 숫자는 strong에 */
  lead: string
  strong: string
  tail: string
  /** 그래서 권장량이 어떻다는 말 */
  so: string
}

type Item = {
  id: string
  name: string
  quantity: number
  shift?: DemandShift | null
}

export function checkFirst(
  items: Item[],
  expiryOf: Map<string, ProductExpiry>,
): CheckReason[] {
  const reasons: CheckReason[] = []
  for (const item of items) {
    const quantity = `${item.quantity.toLocaleString()}개`
    if (item.shift?.direction === 'UP') {
      const times = shiftTimes(item.shift.ratio).trim()
      reasons.push({
        id: item.id,
        name: item.name,
        lead: '판매가 ',
        strong: times || '갑자기',
        tail: ' 늘었어요',
        so: `권장 ${quantity}가 모자랄 수 있어요`,
      })
      continue
    }
    if (item.shift?.direction === 'DOWN') {
      reasons.push({
        id: item.id,
        name: item.name,
        lead: '판매가 ',
        strong: '다시 줄었어요',
        tail: '',
        so: `권장 ${quantity}가 많을 수 있어요`,
      })
      continue
    }
    const expiry = expiryOf.get(item.id)
    if (expiry?.status === 'EXPIRED') {
      reasons.push({
        id: item.id,
        name: item.name,
        lead: '유통기한 지난 재고가 ',
        strong: `${expiry.remainingQty.toLocaleString()}개`,
        tail: ' 있어요',
        so: '팔 수 있는 재고는 더 적어요',
      })
    }
  }
  return reasons
}
