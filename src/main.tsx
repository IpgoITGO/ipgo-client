import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import { env } from './shared/config/env'
import './styles/tokens.css'
import './styles/base.css'

async function enableApiMocking() {
  if (!env.enableMsw) {
    return
  }

  const { worker } = await import('./mocks/browser')
  await worker.start({
    onUnhandledFrame: 'bypass',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  })
}

// 회원가입은 단계가 나뉘어 새로고침하면 입력이 사라지므로, 거기서 새로고침하면 로그인부터 다시 시작한다.
function restartSignupOnReload() {
  const [navigation] = performance.getEntriesByType('navigation')
  const reloaded = (navigation as PerformanceNavigationTiming | undefined)?.type
  if (reloaded === 'reload' && location.pathname === '/signup') {
    history.replaceState(null, '', '/login')
  }
}

restartSignupOnReload()
await enableApiMocking()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('앱을 렌더링할 root 요소를 찾지 못했습니다.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
