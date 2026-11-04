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
  } catch {
    /* 선택적 탭 저장소 */
  }
}
