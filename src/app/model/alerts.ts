import type { DashboardData } from '../../features/dashboard/pages/DashboardPage'
import type { ExpiryLot } from '../../features/expiry/model/expiryApi'
import type { PlannedReceipt } from '../../features/settings/model/plannedReceiptsApi'

export type AlertKind = 'stockout' | 'expiry' | 'receipt'
export type AlertItem = {
  key: string
  kind: AlertKind
  title: string
  reason: string
  to: string
}

type Needed = Pick<
  DashboardData['neededItems'][number],
  'id' | 'name' | 'stockoutDate' | 'leadTime'
>

// "2026. 11. 14" 또는 "2026-11-14" → 날짜 숫자. 못 읽으면 null
function ymd(text: string | null | undefined) {
  const m = text?.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null
}
const DAY = 86_400_000
const md = (t: number) =>
  `${new Date(t).getUTCMonth() + 1}/${new Date(t).getUTCDate()}`

// 서버·화면 값을 받아 알림 목록을 만든다(곧 품절 → 유통기한 → 발주 순, 각각 급한 것부터).
export function buildAlerts(input: {
  needed?: Needed[]
  expiry?: ExpiryLot[]
  receipts?: PlannedReceipt[]
  today: Date
}): AlertItem[] {
  const now = Date.UTC(
    input.today.getFullYear(),
    input.today.getMonth(),
    input.today.getDate(),
  )
  const stock: Array<AlertItem & { sort: number }> = []
  for (const item of input.needed ?? []) {
    const out = ymd(item.stockoutDate)
    if (out === null) continue
    const lead = item.leadTime ?? 0
    if (out - lead * DAY > now) continue
    stock.push({
      key: `stock:${item.id}:${out}`,
      kind: 'stockout',
      title: item.name,
      reason:
        out < now
          ? '이미 소진됐을 수 있어요'
          : item.leadTime == null
            ? `${md(out)} 소진 · 지금 넣어야 해요`
            : `${md(out)} 소진 · 리드타임 ${lead}일`,
      to: `/sku/${item.id}`,
      sort: out,
    })
  }
  const exp: Array<AlertItem & { sort: number }> = []
  for (const lot of input.expiry ?? []) {
    if (lot.remainingQty <= 0) continue
    if (lot.status !== 'EXPIRED' && lot.status !== 'IMMINENT') continue
    const left = `${lot.remainingQty}개 남음`
    exp.push({
      key: `expiry:${lot.productId}:${lot.expiryDate}:${lot.status}`,
      kind: 'expiry',
      title: lot.skuName,
      reason:
        lot.status === 'EXPIRED'
          ? `유통기한이 지났어요 · ${left}`
          : `유통기한 D-${lot.daysLeft ?? '?'} · ${left}`,
      to: `/sku/${lot.productId}`,
      sort: lot.status === 'EXPIRED' ? -Infinity : (lot.daysLeft ?? 0),
    })
  }
  const rec: Array<AlertItem & { sort: number }> = []
  for (const r of input.receipts ?? []) {
    if (r.status !== 'OVERDUE') continue
    const on = ymd(r.expectedOn)
    rec.push({
      key: `receipt:${r.receiptId}`,
      kind: 'receipt',
      title: r.skuName,
      reason: `도착 예정일 ${on === null ? '' : md(on) + '이 '}지났어요 · 확인해 주세요`,
      to: '/settings',
      sort: on ?? 0,
    })
  }
  const bySort = (a: { sort: number; key: string }, b: typeof a) =>
    a.sort === b.sort ? a.key.localeCompare(b.key) : a.sort < b.sort ? -1 : 1
  return [...stock.sort(bySort), ...exp.sort(bySort), ...rec.sort(bySort)].map(
    (a) => ({
      key: a.key,
      kind: a.kind,
      title: a.title,
      reason: a.reason,
      to: a.to,
    }),
  )
}
