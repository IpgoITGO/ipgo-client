import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import { SIGNUP_OPEN_KEY } from './auth/model/signupSession'
import { env } from './shared/config/env'
import './styles/tokens.css'
import './styles/base.css'

async function enableApiMocking() {
  if (!env.enableMsw) {
    return
  }

  const { worker, keepMockingActive } = await import('./mocks/browser')
  await worker.start({
    onUnhandledFrame: 'bypass',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  })
  keepMockingActive()
}

// 회원가입은 단계가 나뉘어 새로고침하면 입력이 사라지므로, 그 탭에서 회원가입 화면을 다시 불러오면
// 로그인부터 다시 시작한다. F5든 주소창 Enter든 같게 다루려고 새로고침 종류 대신 탭 표시(sessionStorage)를 본다.
function restartSignupOnReload() {
  try {
    if (
      location.pathname === '/signup' &&
      sessionStorage.getItem(SIGNUP_OPEN_KEY)
    ) {
      sessionStorage.removeItem(SIGNUP_OPEN_KEY)
      history.replaceState(null, '', '/login')
    }
  } catch {
    // 저장소를 못 쓰는 브라우저에서는 그대로 둔다.
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
