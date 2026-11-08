import type { DecisionRequest, Preview } from './receiptApi'
export type Attempt = {
  request: DecisionRequest
  preview: Preview
  phase: 'ready' | 'unknown'
}
const PREFIX = 'ipgo:receipt-correction:'
const key = (owner: string, id: number) =>
  `${PREFIX}${encodeURIComponent(owner)}:${id}`
export function readAttempt(owner: string, id: number): Attempt | null {
  try {
    const raw = sessionStorage.getItem(key(owner, id))
    if (!raw) return null
    const value = JSON.parse(raw)
    const r = value.attempt?.request
    const p = value.attempt?.preview
    if (
      value.owner !== owner ||
      value.reviewId !== id ||
      !r ||
      !p ||
      !/^[a-f0-9]{64}$/.test(r.expectedVersion) ||
      !/^[a-f0-9-]{36}$/.test(r.idempotencyKey) ||
      !['KEEP', 'REPLACE'].includes(r.action) ||
      typeof r.reason !== 'string' ||
      !r.reason.trim() ||
      r.reason.length > 500 ||
      !Array.isArray(r.receiptIds) ||
      r.receiptIds.length > 200 ||
      r.receiptIds.some(
        (n: unknown) =>
          typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1,
      ) ||
      p.version !== r.expectedVersion ||
      p.action !== r.action ||
      !['ready', 'unknown'].includes(value.attempt.phase) ||
      !Array.isArray(p.before) ||
      !Array.isArray(p.after) ||
      !Array.isArray(p.changes) ||
      !Array.isArray(p.warnings)
    )
      return null
    return value.attempt
  } catch {
    return null
  }
}
export function storeAttempt(owner: string, id: number, attempt: Attempt) {
  sessionStorage.setItem(
    key(owner, id),
    JSON.stringify({ owner, reviewId: id, attempt }),
  )
}
export function clearAttempt(owner: string, id: number) {
  try {
    sessionStorage.removeItem(key(owner, id))
  } catch {
    /* 서버의 저장 결과는 유지한다. */
  }
}
export function clearReceiptAttempts() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k)
    }
  } catch {
    /* 서버 로그아웃을 방해하지 않는다 */
  }
}
