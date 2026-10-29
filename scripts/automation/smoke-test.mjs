const baseUrl = process.env.DEPLOYMENT_URL
if (!baseUrl) throw new Error('DEPLOYMENT_URL이 필요합니다.')

for (const path of ['/', '/login', '/dashboard', '/mockServiceWorker.js']) {
  const response = await fetch(new URL(path, baseUrl), { redirect: 'error' })
  if (!response.ok) {
    throw new Error(`${path} 확인 실패: HTTP ${response.status}`)
  }
  const body = await response.text()
  if (
    path !== '/mockServiceWorker.js' &&
    !body.includes('<div id="root"></div>')
  ) {
    throw new Error(`${path}에서 React root를 찾지 못했습니다.`)
  }
  if (
    path === '/mockServiceWorker.js' &&
    !body.includes('Mock Service Worker')
  ) {
    throw new Error('mockServiceWorker.js 내용이 올바르지 않습니다.')
  }
  console.log(`${path}: HTTP ${response.status}`)
}
