import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import test from 'node:test'

const source = await readFile(
  new URL('../../public/push-sw.js', import.meta.url),
  'utf8',
)
function worker(windows = []) {
  const listeners = new Map()
  const shown = [],
    opened = []
  const self = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    location: { origin: 'https://example.test' },
    registration: { showNotification: async (...args) => shown.push(args) },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url) => opened.push(url),
    },
  }
  vm.runInNewContext(source, { self, URL })
  async function fire(type, event) {
    let pending
    listeners.get(type)({
      ...event,
      waitUntil: (promise) => {
        pending = promise
      },
    })
    await pending
  }
  return { fire, shown, opened }
}
test('합성 push는 고정 제목과 민감정보 없는 본문을 표시한다', async () => {
  const w = worker()
  await w.fire('push', {
    data: {
      json: () => ({
        notificationId: 'daily-12',
        title: 'arbitrary',
        body: '지금 넣어야 할 상품 3개',
        url: 'https://evil.test',
      }),
    },
  })
  assert.equal(w.shown[0][0], '입고가 필요한 상품이 있어요')
  assert.equal(w.shown[0][1].body, '지금 넣어야 할 상품 3개')
  assert.equal(w.shown[0][1].data.url, '/dashboard')
})
test('잘못된 payload는 표시하지 않는다', async () => {
  const w = worker()
  await w.fire('push', {
    data: {
      json: () => {
        throw new Error('invalid')
      },
    },
  })
  await w.fire('push', {
    data: { json: () => ({ notificationId: 'arbitrary' }) },
  })
  assert.equal(w.shown.length, 0)
})
test('클릭은 payload 외부 URL을 무시하고 대시보드를 연다', async () => {
  const w = worker()
  await w.fire('notificationclick', {
    notification: { close() {}, data: { url: 'https://evil.test' } },
  })
  assert.deepEqual(w.opened, ['https://example.test/dashboard'])
})
test('열린 동일 사이트 창이 있으면 대시보드로 이동하고 포커스한다', async () => {
  const navigated = [],
    focused = []
  const w = worker([
    {
      url: 'https://example.test/account',
      navigate: async (url) => navigated.push(url),
      focus: async () => focused.push(true),
    },
  ])
  await w.fire('notificationclick', { notification: { close() {} } })
  assert.deepEqual(navigated, ['https://example.test/dashboard'])
  assert.equal(focused.length, 1)
  assert.equal(w.opened.length, 0)
})
test('구독 변경은 열린 페이지에 재연결을 요청하고 worker에서 인증을 우회하지 않는다', async () => {
  const messages = []
  const w = worker([{ postMessage: (message) => messages.push(message) }])
  await w.fire('pushsubscriptionchange', {})
  assert.equal(messages[0].type, 'push-subscription-changed')
})
