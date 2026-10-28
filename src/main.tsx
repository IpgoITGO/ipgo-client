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
