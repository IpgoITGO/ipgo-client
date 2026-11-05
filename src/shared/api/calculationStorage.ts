const KEY = 'ipgo:calculation-run'

export function readTrackedRun(scope?: string): number | null {
  if (!scope) return null
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    return saved?.scope === scope &&
      Number.isSafeInteger(saved.runId) &&
      saved.runId > 0
      ? saved.runId
      : null
  } catch {
    return null
  }
}

export function writeTrackedRun(scope: string, runId: number | null) {
  try {
    if (runId === null) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, JSON.stringify({ scope, runId }))
  } catch {
    /* 저장소 사용이 막혀 있어도 현재 화면의 추적은 유지한다. */
  }
}

export function clearTrackedRun() {
  try {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem(UPLOAD_KEY)
  } catch {
    /* 선택적 탭 저장소 */
  }
}

// 수불부 확인(정제) 단계 추적. 시작 시각을 같이 저장해 이동·새로고침 뒤에도 N분째가 이어진다.
const UPLOAD_KEY = 'ipgo:calculation-upload'
export type TrackedUpload = { uploadId: string; startedAt: number }

export function readTrackedUpload(scope?: string): TrackedUpload | null {
  if (!scope) return null
  try {
    const saved = JSON.parse(sessionStorage.getItem(UPLOAD_KEY) ?? 'null')
    return saved?.scope === scope &&
      typeof saved.uploadId === 'string' &&
      saved.uploadId &&
      Number.isFinite(saved.startedAt)
      ? { uploadId: saved.uploadId, startedAt: saved.startedAt }
      : null
  } catch {
    return null
  }
}

export function writeTrackedUpload(
  scope: string,
  upload: TrackedUpload | null,
) {
  try {
    if (!upload) sessionStorage.removeItem(UPLOAD_KEY)
    else
      sessionStorage.setItem(UPLOAD_KEY, JSON.stringify({ scope, ...upload }))
  } catch {
    /* 저장소가 막혀 있어도 현재 화면의 추적은 유지한다. */
  }
}
