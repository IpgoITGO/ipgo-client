import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../../shared/api/client'
import { browserConnected, connectBrowser, disconnectBrowser } from './pushApi'

vi.mock('../../shared/api/client', () => ({ apiRequest: vi.fn() }))
vi.mock('../../shared/config/env', () => ({ env: { enableMsw: false } }))

const unsubscribe = vi.fn()
const subscribe = vi.fn()
const getSubscription = vi.fn()
const registration = {
  active: { scriptURL: 'https://example.test/push-sw.js', state: 'activated' },
  pushManager: { getSubscription, subscribe },
}
const permission = vi.fn()
const subscription = {
  endpoint: 'https://fcm.googleapis.com/test-only',
  options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer },
  toJSON: () => ({
    endpoint: 'test-only',
    keys: { p256dh: 'test-only', auth: 'test-only' },
  }),
  unsubscribe,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', {
    permission: 'granted',
    requestPermission: permission,
  })
  permission.mockResolvedValue('granted')
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  })
  vi.mocked(apiRequest).mockImplementation(async (path) =>
    path === '/push/public-key'
      ? ({ publicKey: 'AQID' } as never)
      : (undefined as never),
  )
  getSubscription.mockResolvedValue(subscription)
  subscribe.mockResolvedValue(subscription)
  unsubscribe.mockResolvedValue(true)
})

afterEach(() => vi.unstubAllGlobals())

describe('브라우저 Web Push 연결', () => {
  it('클릭으로 권한을 받은 뒤 기존 구독을 현재 계정에 다시 연결한다', async () => {
    await connectBrowser(true)
    expect(permission).toHaveBeenCalledOnce()
    expect(subscribe).not.toHaveBeenCalled()
    expect(apiRequest).toHaveBeenCalledWith(
      '/push/subscriptions',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(await browserConnected()).toBe(true)
  })
  it('권한을 거절하면 구독 API를 호출하지 않는다', async () => {
    permission.mockResolvedValue('denied')
    await expect(connectBrowser(true)).rejects.toThrow('알림이 허용되지')
    expect(apiRequest).not.toHaveBeenCalled()
  })
  it('페이지 복구에서는 권한 창을 띄우지 않는다', async () => {
    await connectBrowser(false)
    expect(permission).not.toHaveBeenCalled()
  })
  it('VAPID 키가 교체되면 이전 브라우저 구독을 폐기하고 다시 등록한다', async () => {
    getSubscription
      .mockResolvedValueOnce({
        ...subscription,
        options: { applicationServerKey: new Uint8Array([9]).buffer },
      })
      .mockResolvedValueOnce(null)
    await connectBrowser(false)
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
  })
  it('로그아웃 전 서버 본인 구독 삭제 후 브라우저 주소도 폐기한다', async () => {
    await disconnectBrowser()
    expect(apiRequest).toHaveBeenCalledWith(
      '/push/subscriptions',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
  it('서버 해제에 실패해도 브라우저 전송 주소는 폐기한다', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error('offline'))
    await expect(disconnectBrowser()).resolves.toBeUndefined()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
  it('교체 worker가 활성화되기 전에 구독 API를 보내지 않는다', async () => {
    let changed: (() => void) | undefined
    const installing = {
      scriptURL: 'https://example.test/push-sw.js',
      state: 'installing',
      addEventListener: (_type: string, callback: () => void) => {
        changed = callback
      },
      removeEventListener: vi.fn(),
    }
    vi.mocked(navigator.serviceWorker.register).mockResolvedValueOnce({
      ...registration,
      installing,
    } as never)
    const connecting = connectBrowser(false)
    await vi.waitFor(() => expect(changed).toBeTypeOf('function'))
    expect(apiRequest).not.toHaveBeenCalledWith(
      '/push/subscriptions',
      expect.anything(),
    )
    installing.state = 'activated'
    changed?.()
    await connecting
    expect(apiRequest).toHaveBeenCalledWith(
      '/push/subscriptions',
      expect.anything(),
    )
  })

  it('로그아웃 연결 해제 중에는 다음 계정 재연결을 직렬화한다', async () => {
    await connectBrowser(false)
    let completeDelete: (() => void) | undefined
    vi.mocked(apiRequest).mockImplementation(async (path, init) => {
      if (init?.method === 'DELETE')
        await new Promise<void>((resolve) => {
          completeDelete = resolve
        })
      return (
        path === '/push/public-key' ? { publicKey: 'AQID' } : undefined
      ) as never
    })
    const disconnecting = disconnectBrowser()
    await vi.waitFor(() => expect(completeDelete).toBeTypeOf('function'))
    const reconnecting = connectBrowser(false)
    expect(navigator.serviceWorker.register).toHaveBeenCalledTimes(1)
    completeDelete?.()
    await disconnecting
    await reconnecting
    expect(navigator.serviceWorker.register).toHaveBeenCalledTimes(2)
  })

  it('MSW worker는 로그아웃 해제 과정에서 건드리지 않는다', async () => {
    vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValueOnce({
      ...registration,
      active: { scriptURL: 'https://example.test/mockServiceWorker.js' },
    } as never)
    await disconnectBrowser()
    expect(unsubscribe).not.toHaveBeenCalled()
  })
})
