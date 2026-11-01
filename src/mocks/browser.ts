import { setupWorker } from 'msw/browser'

import { setApiRequestReadinessCheck } from '../shared/api/client'
import { handlers } from './handlers'
import { createMockWorkerReadiness } from './workerReadiness'

export const worker = setupWorker(...handlers)

let stopKeepingActive: (() => void) | undefined

export function keepMockingActive(registration?: ServiceWorkerRegistration) {
  stopKeepingActive?.()
  // Service Worker 미지원 환경에서 MSW가 fallback interceptor를 쓰는 경우도 보존한다.
  if (!registration || !('serviceWorker' in navigator)) return

  const ensureReady = createMockWorkerReadiness(
    navigator.serviceWorker,
    new URL('/mockServiceWorker.js', window.location.origin).href,
  )
  const removeReadinessCheck = setApiRequestReadinessCheck(ensureReady)
  const reactivate = () => {
    if (document.visibilityState === 'visible') {
      // 포커스 시에는 미리 준비하고, 실패 안내는 다음 실제 API 요청에서 처리한다.
      void ensureReady().catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', reactivate)
  window.addEventListener('focus', reactivate)
  stopKeepingActive = () => {
    document.removeEventListener('visibilitychange', reactivate)
    window.removeEventListener('focus', reactivate)
    removeReadinessCheck()
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => stopKeepingActive?.())
}
