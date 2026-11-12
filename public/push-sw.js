self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
)

/* 실제 Web Push 전용. MSW가 켜진 개발 환경에서는 등록하지 않는다. */
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload
      try {
        payload = event.data?.json()
      } catch {
        return
      }
      if (
        !payload ||
        typeof payload.notificationId !== 'string' ||
        !/^daily-\d+$/.test(payload.notificationId)
      )
        return
      await self.registration.showNotification('입고가 필요한 상품이 있어요', {
        body:
          typeof payload.body === 'string' &&
          /^지금 넣어야 할 상품 \d+개$/.test(payload.body)
            ? payload.body
            : '대시보드에서 발주가 필요한 상품을 확인해 주세요.',
        tag: payload.notificationId,
        data: { url: '/dashboard' },
        icon: '/favicon.png',
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const target = new URL('/dashboard', self.location.origin).href
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      )
      if (existing) {
        await existing.navigate(target)
        await existing.focus()
      } else await self.clients.openWindow(target)
    })(),
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  // 액세스 토큰은 페이지 메모리에만 있다. 인증 없는 worker에서 구독 API를 우회하지 않는다.
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((windows) => {
      for (const client of windows)
        client.postMessage({ type: 'push-subscription-changed' })
    }),
  )
})
