// 보관 비용(Should). 상자 크기(cm)와 창고 보관 요율(원/CBM·월)로 한 달 보관비를 보여 준다.
// 서버 저장(server #111·#132): 요율은 GET/PUT /settings/storage-cost, 상자는 PUT/DELETE /products/{id}/box.
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../auth/model/useAuth'
import { apiRequest } from '../../../shared/api/client'

export type Box = { width: number; depth: number; height: number }

export type StorageSettings = {
  // 원 / CBM · 월. 아직 안 넣었으면 null
  ratePerCbm: number | null
  // 상품 id → 상자 1개 크기(cm)
  boxes: Record<string, Box>
}

const EMPTY: StorageSettings = { ratePerCbm: null, boxes: {} }
export const storageKey = (owner: string | undefined) =>
  ['storage-cost', owner] as const

export async function loadStorageSettings(
  signal?: AbortSignal,
): Promise<StorageSettings> {
  const response = await apiRequest<{
    ratePerCbm: number | null
    boxes: Array<Box & { productId: number }>
  }>('/settings/storage-cost', { signal })
  return {
    ratePerCbm: response.ratePerCbm ?? null,
    boxes: Object.fromEntries(
      (response.boxes ?? []).map(({ productId, width, depth, height }) => [
        String(productId),
        { width, depth, height },
      ]),
    ),
  }
}

export async function saveRate(ratePerCbm: number | null) {
  await apiRequest('/settings/storage-cost', {
    method: 'PUT',
    body: JSON.stringify({ ratePerCbm }),
  })
}

export async function saveBox(productId: string, box: Box | null) {
  const path = `/products/${encodeURIComponent(productId)}/box`
  if (!box) await apiRequest<void>(path, { method: 'DELETE' })
  else await apiRequest(path, { method: 'PUT', body: JSON.stringify(box) })
}

export function useStorageQuery() {
  const { user, status } = useAuth()
  return useQuery({
    queryKey: storageKey(user?.email),
    queryFn: ({ signal }) => loadStorageSettings(signal),
    enabled: status === 'authenticated',
  })
}
// 못 불러오면 빈 값으로(보관비는 선택 항목이라 화면을 막지 않는다)
export function useStorageSettings() {
  return useStorageQuery().data ?? EMPTY
}

// 1,000,000 cm³ = 1 CBM(m³)
export function cbmOf(box: Box) {
  return (box.width * box.depth * box.height) / 1_000_000
}

// 0.012 CBM → "0.012", 1.5 → "1.5"
export function formatCbm(cbm: number) {
  return String(Number(cbm.toFixed(4)))
}

// 이번에 넣을 수량을 한 달 둘 때의 보관비. 크기·요율 중 하나라도 없으면 null(0원으로 보이지 않게).
export function monthlyStorageCost(
  box: Box | undefined,
  quantity: number | null | undefined,
  ratePerCbm: number | null,
) {
  if (!box || ratePerCbm == null || quantity == null) return null
  return Math.round(cbmOf(box) * quantity * ratePerCbm)
}

// 대시보드 합계. 크기를 안 넣은 상품은 빼고 몇 개인지 따로 센다.
export function storageCostTotal(
  items: Array<{ id: string; quantity: number | null }>,
  settings: StorageSettings,
) {
  let total = 0
  let missing = 0
  for (const item of items) {
    const cost = monthlyStorageCost(
      settings.boxes[item.id],
      item.quantity,
      settings.ratePerCbm,
    )
    if (cost == null) missing += 1
    else total += cost
  }
  return { total, missing, counted: items.length - missing }
}

// 입력 칸 글자 → 0보다 큰 숫자. 아니면 null
export function positiveNumber(text: string) {
  const value = Number(text.replace(/,/g, '').trim())
  return text.trim() !== '' && Number.isFinite(value) && value > 0
    ? value
    : null
}

// 금액 칸을 치는 동안 천 단위 쉼표(12000 → 12,000). 숫자 말고는 지운다. 저장은 positiveNumber가 쉼표를 뺀다.
export function withCommas(text: string) {
  const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return digits === '' ? '' : Number(digits).toLocaleString('ko-KR')
}

// 다른 화면에서 보관 비용 칸으로 바로 오는 주소: /settings#storage-cost
export const STORAGE_ANCHOR = 'storage-cost'
export const STORAGE_LINK = `/settings#${STORAGE_ANCHOR}`
