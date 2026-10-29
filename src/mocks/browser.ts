import { setupWorker } from 'msw/browser'

import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

// 브라우저는 쉬는 탭의 서비스 워커를 멈추고, 다시 깨운 워커는 이 페이지를 잊는다.
// 그러면 요청이 가짜 서버를 지나쳐 "서버에 연결하지 못했어요"가 뜬다.
// 탭으로 돌아오거나 창이 포커스를 받을 때마다 워커에 이 페이지를 다시 알린다.
export function keepMockingActive() {
  const reactivate = () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.controller?.postMessage('MOCK_ACTIVATE')
    }
  }
  document.addEventListener('visibilitychange', reactivate)
  window.addEventListener('focus', reactivate)
}
