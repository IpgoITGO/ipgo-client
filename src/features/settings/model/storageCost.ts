// 보관 비용(Should). 상자 크기(cm)와 창고 보관 요율(원/CBM·월)로 한 달 보관비를 보여 준다.
// ponytail: 서버 API가 아직 없어 이 브라우저에만 저장한다(기기·계정 사이 공유 안 됨).
// 서버에 입고 조건 칸이 생기면 load/save만 API 호출로 바꾸면 된다(#185).

export type Box = { width: number; depth: number; height: number }

export type StorageSettings = {
  // 원 / CBM · 월. 아직 안 넣었으면 null
  ratePerCbm: number | null
  // 상품 id → 상자 1개 크기(cm)
  boxes: Record<string, Box>
}

const KEY = 'ipgo:storage-cost'
const EMPTY: StorageSettings = { ratePerCbm: null, boxes: {} }

export function loadStorageSettings(): StorageSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<StorageSettings>
    return { ratePerCbm: parsed.ratePerCbm ?? null, boxes: parsed.boxes ?? {} }
  } catch {
    return EMPTY
  }
}

export function saveStorageSettings(settings: StorageSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
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
