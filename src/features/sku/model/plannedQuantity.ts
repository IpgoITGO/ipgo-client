import { shortDate } from '../../../shared/lib/elapsed'

// 상세·테스트가 여기서 가져다 쓴다(날짜 짧게 쓰기는 shared 한 곳)
export { shortDate }
// 내 입고량: 상품 상세에서 시나리오·직접 넣은 수량을 보고 "이걸로 정함"을 남긴다. 대시보드·엑셀이 이어 쓴다.
// ponytail: 서버 API가 아직 없어 이 브라우저에만 저장한다(ipgo-server#119). 생기면 load/save만 API 호출로 바꾼다.
import { useMemo, useSyncExternalStore } from 'react'

export type PlannedSource =
  'SCENARIO_80' | 'SCENARIO_100' | 'SCENARIO_120' | 'MANUAL'

export type Planned = {
  quantity: number
  source: PlannedSource
  /** 정한 날(YYYY-MM-DD) */
  decidedAt: string
  /** 권장을 가져온 계산의 기준일(대시보드 "기준일"과 같은 글자). 지금 결과와 다르면 지난 계산 기준 */
  basis: string
}

const KEY = 'ipgo:planned-quantity'
const listeners = new Set<() => void>()

function read() {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

function parse(raw: string): Record<string, Planned> {
  try {
    return raw ? (JSON.parse(raw) as Record<string, Planned>) : {}
  } catch {
    return {}
  }
}

export function loadPlanned() {
  return parse(read())
}

export function savePlanned(productId: string, planned: Planned | null) {
  const all = loadPlanned()
  if (planned) all[productId] = planned
  else delete all[productId]
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    return false
  }
  listeners.forEach((listener) => listener())
  return true
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

export function usePlanned() {
  const raw = useSyncExternalStore(subscribe, read, () => '')
  return useMemo(() => parse(raw), [raw])
}

/** 권장 그대로(100%)는 "내 입고량"으로 따로 보이지 않는다 */
export const isOwnPlan = (planned?: Planned): planned is Planned =>
  !!planned && planned.source !== 'SCENARIO_100'

export const isStale = (planned: Planned, currentBasis: string) =>
  planned.basis !== currentBasis

/** "2026-11-05" → "11/5" */
/** "2026. 11. 4" → "11/4" */
export function shortBasis(basis: string) {
  return shortDate(basis)
}

export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
