import { apiRequest } from '../../shared/api/client'
import { env } from '../../shared/config/env'

export type NotificationSettings = {
  enabled: boolean
  sendHour: number
  timeZone: string
}

export const getNotificationSettings = () =>
  apiRequest<NotificationSettings>('/notifications/settings')

export const saveNotificationSettings = (
  settings: Partial<NotificationSettings>,
) =>
  apiRequest<NotificationSettings>('/notifications/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })

export function pushSupported() {
  return (
    !env.enableMsw &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function decodePublicKey(value: string) {
  const padded =
    value.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

let pendingConnection: Promise<void> = Promise.resolve()

function enqueuePushAction(action: () => Promise<void>) {
  const next = pendingConnection.catch(() => undefined).then(action)
  pendingConnection = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

export function connectBrowser(requestPermission: boolean) {
  // 권한 요청은 사용자 클릭의 활성화 기간 안에서 바로 시작한다.
  const permission =
    requestPermission && pushSupported()
      ? Notification.requestPermission()
      : Promise.resolve(
          'Notification' in window
            ? Notification.permission
            : ('denied' as NotificationPermission),
        )
  return enqueuePushAction(() => connectWithPermission(permission))
}

async function connectWithPermission(
  permissionResult: Promise<NotificationPermission>,
) {
  if (!pushSupported())
    throw new Error(
      '실제 HTTPS 사이트의 PC 브라우저에서 연결해 주세요. 모의 API에서는 연결할 수 없어요.',
    )
  // 클릭 직후 호출할 때만 권한을 요청한다. 페이지를 열 때는 권한 팝업을 띄우지 않는다.
  const permission = await permissionResult
  if (permission !== 'granted')
    throw new Error(
      '알림이 허용되지 않았어요. 주소창의 사이트 설정에서 알림을 허용해 주세요.',
    )
  const { publicKey } = await apiRequest<{ publicKey: string }>(
    '/push/public-key',
  )
  const registration = await navigator.serviceWorker.register('/push-sw.js', {
    scope: '/',
  })
  const worker =
    registration.installing ?? registration.waiting ?? registration.active
  if (!worker?.scriptURL.endsWith('/push-sw.js'))
    throw new Error('알림 프로그램을 준비하지 못했어요. 다시 시도해 주세요.')
  if (worker.state !== 'activated') {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        worker.removeEventListener('statechange', changed)
        reject(
          new Error(
            '알림 프로그램 준비가 지연되고 있어요. 다시 시도해 주세요.',
          ),
        )
      }, 15000)
      function changed() {
        if (worker?.state === 'activated' || worker?.state === 'redundant') {
          window.clearTimeout(timer)
          worker.removeEventListener('statechange', changed)
          if (worker.state === 'activated') resolve()
          else
            reject(
              new Error(
                '알림 프로그램을 준비하지 못했어요. 다시 시도해 주세요.',
              ),
            )
        }
      }
      worker.addEventListener('statechange', changed)
      changed()
    })
  }
  const current = await registration.pushManager.getSubscription()
  if (current) {
    const expected = decodePublicKey(publicKey)
    const actual =
      current.options.applicationServerKey &&
      new Uint8Array(current.options.applicationServerKey)
    if (
      !actual ||
      expected.length !== actual.length ||
      expected.some((value, i) => value !== actual[i])
    ) {
      if (!(await current.unsubscribe()))
        throw new Error(
          '이전 알림 연결을 해제하지 못했어요. 다시 시도해 주세요.',
        )
    }
  }
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodePublicKey(publicKey),
    }))
  try {
    await apiRequest<{ subscriptionId: number }>('/push/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    })
  } catch (error) {
    await subscription.unsubscribe().catch(() => false)
    throw error
  }
  window.dispatchEvent(new Event('ipgo:push-state-changed'))
}

export async function browserConnected() {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const registration =
    await navigator.serviceWorker.getRegistration('/push-sw.js')
  return !!(await registration?.pushManager.getSubscription())
}

export function disconnectBrowser() {
  return enqueuePushAction(disconnectCurrentBrowser)
}

async function disconnectCurrentBrowser() {
  if (!('serviceWorker' in navigator)) return
  const registration =
    await navigator.serviceWorker.getRegistration('/push-sw.js')
  // MSW나 다른 용도의 worker는 건드리지 않는다.
  if (!registration?.active?.scriptURL.endsWith('/push-sw.js')) return
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  let removedOnServer = false
  try {
    await apiRequest<void>('/push/subscriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
    removedOnServer = true
  } catch {
    /* 네트워크 실패 시에도 브라우저 주소 폐기를 시도한다. */
  }
  const unsubscribed = await subscription.unsubscribe().catch(() => false)
  window.dispatchEvent(new Event('ipgo:push-state-changed'))
  if (!removedOnServer && !unsubscribed) {
    throw new Error('브라우저 알림 연결 해제에 실패했어요. 다시 시도해 주세요.')
  }
}

export function unsubscribeNativeBrowser() {
  return enqueuePushAction(unsubscribeCurrentNativeBrowser)
}

async function unsubscribeCurrentNativeBrowser() {
  if (!('serviceWorker' in navigator)) return
  const registration =
    await navigator.serviceWorker.getRegistration('/push-sw.js')
  if (registration?.active?.scriptURL.endsWith('/push-sw.js')) {
    await (await registration.pushManager.getSubscription())?.unsubscribe()
  }
}
