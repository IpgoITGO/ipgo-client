import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest, ApiError } from '../../shared/api/client'
import {
  browserConnected,
  connectBrowser,
  disconnectBrowser,
  getNotificationSettings,
  pushSupported,
  saveNotificationSettings,
} from './pushApi'
import { Button } from '../../shared/ui/Button/Button'
import styles from './NotificationSettings.module.css'

const KEY = ['notifications', 'settings'] as const

export function NotificationSettings() {
  const client = useQueryClient()
  const settings = useQuery({
    queryKey: KEY,
    queryFn: getNotificationSettings,
    retry: false,
  })
  const publicKey = useQuery({
    queryKey: ['notifications', 'public-key'],
    queryFn: () => apiRequest<{ publicKey: string }>('/push/public-key'),
    retry: false,
  })
  const [connected, setConnected] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    const update = () => {
      void browserConnected()
        .then((value) => {
          if (active) setConnected(value)
        })
        .catch(() => {
          if (active) setConnected(false)
        })
    }
    update()
    window.addEventListener('ipgo:push-state-changed', update)
    window.addEventListener('focus', update)
    return () => {
      active = false
      window.removeEventListener('ipgo:push-state-changed', update)
      window.removeEventListener('focus', update)
    }
  }, [])
  const mutation = useMutation({
    mutationFn: async (action: 'enable' | 'disable' | number) => {
      setMessage('')
      if (action === 'enable') {
        await connectBrowser(true)
        try {
          return await saveNotificationSettings({ enabled: true })
        } catch (error) {
          await disconnectBrowser().catch(() => undefined)
          throw error
        }
      }
      if (action === 'disable') {
        const result = await saveNotificationSettings({ enabled: false })
        client.setQueryData(KEY, result)
        await disconnectBrowser()
        return result
      }
      return saveNotificationSettings({ sendHour: action })
    },
    onSuccess: async (value) => {
      client.setQueryData(KEY, value)
      setConnected(await browserConnected())
      setMessage(
        value.enabled
          ? '알림 설정을 저장했어요.'
          : '모든 기기의 하루 1회 알림을 껐어요.',
      )
    },
    onError: (error) => {
      setMessage(
        error instanceof ApiError && error.code === 'PUSH_UNAVAILABLE'
          ? '알림 서비스를 준비 중이에요.'
          : error instanceof Error
            ? error.message
            : '설정을 저장하지 못했어요.',
      )
    },
  })
  const unavailable = !pushSupported()
  return (
    <section className={styles.panel} aria-labelledby="push-title">
      <h2 className={styles.title} id="push-title">
        재고 · 유통기한 · 발주 알림
      </h2>
      <p className={styles.description}>
        발주가 필요한 상품이 있으면 하루 한 번 알려드려요. 상품명이나 금액은
        알림에 표시하지 않아요.
      </p>
      {settings.isError ? (
        <p role="alert">
          알림 설정을 불러오지 못했어요.{' '}
          <Button
            type="button"
            variant="secondary"
            onClick={() => void settings.refetch()}
          >
            다시 시도
          </Button>
        </p>
      ) : (
        <>
          <p className={styles.connection}>
            {settings.data?.enabled
              ? '하루 1회 알림이 켜져 있어요.'
              : '하루 1회 알림이 꺼져 있어요.'}{' '}
            {connected
              ? '이 브라우저가 연결돼 있어요.'
              : '이 브라우저는 연결되지 않았어요.'}
          </p>
          <label className={styles.time}>
            받을 시각
            <select
              aria-label="알림 받을 시각"
              aria-describedby="push-time-hint"
              disabled={!settings.data || mutation.isPending}
              value={settings.data?.sendHour ?? 9}
              onChange={(event) => mutation.mutate(Number(event.target.value))}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {hour}시
                </option>
              ))}
            </select>
          </label>
          <small className={styles.hint} id="push-time-hint">
            {settings.data?.timeZone ?? 'Asia/Seoul'} 기준 · 정시부터 1시간 안에
            발송하며 대상이 없으면 보내지 않아요.
          </small>
          <div className={styles.actions}>
            <Button
              type="button"
              variant="primary"
              disabled={
                unavailable ||
                !publicKey.data ||
                !settings.data ||
                mutation.isPending
              }
              onClick={() => mutation.mutate('enable')}
            >
              {settings.data?.enabled && !connected
                ? '이 브라우저 연결'
                : '알림 켜고 이 브라우저 연결'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!settings.data?.enabled || mutation.isPending}
              onClick={() => mutation.mutate('disable')}
            >
              알림 끄기
            </Button>
          </div>
        </>
      )}
      {publicKey.isError && (
        <p>
          {publicKey.error instanceof ApiError &&
          publicKey.error.code === 'PUSH_UNAVAILABLE'
            ? '알림 서비스를 준비 중이에요.'
            : '알림 연결 상태를 불러오지 못했어요.'}
        </p>
      )}
      {unavailable && (
        <p>
          실제 사이트의 HTTPS PC 브라우저에서 연결해 주세요. 모의 API에서는 알림
          연결을 사용하지 않아요.
        </p>
      )}
      <p className={styles.feedback} role="status">
        {mutation.isPending ? '설정을 저장하고 있어요…' : message}
      </p>
    </section>
  )
}
