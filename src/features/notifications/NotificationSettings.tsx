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
import bellOff from './bell-off.webp'
import bellOn from './bell-on.webp'
import { HourPicker } from './HourPicker'
import { hourLabel } from './hourLabel'
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
    // 요금제 상자와 같은 짜임(11/13): 그림 + 작은 제목 + 큰 상태 줄 + 오른쪽 버튼, 아래 3칸 정보
    <section className={styles.panel} aria-labelledby="push-title">
      <div className={styles.hero}>
        {/* 꺼져 있으면 X 붙은 조용한 종, 켜져 있으면 울리는 종(11/13) */}
        <img
          alt=""
          className={styles.art}
          height="80"
          src={settings.data?.enabled ? bellOn : bellOff}
          width="80"
        />
        <div className={styles.headline}>
          <h2 className={styles.title} id="push-title">
            재고 · 유통기한 · 발주 알림
          </h2>
          <p className={styles.state}>
            <strong>
              {settings.data?.enabled
                ? `매일 ${hourLabel(settings.data.sendHour)}에 알려 드려요`
                : '알림이 꺼져 있어요'}
            </strong>
            <span className={styles.pill} data-on={connected || undefined}>
              {connected ? '이 브라우저 연결됨' : '이 브라우저 연결 안 됨'}
            </span>
          </p>
        </div>
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
      </div>
      {settings.isError ? (
        <p className={styles.error} role="alert">
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
        // 아래 한 줄: 받을 시각 고르기 + 짧은 설명 하나(11/13 "글이 너무 많아")
        <div className={styles.timeRow}>
          <span className={styles.time}>
            받을 시각
            <HourPicker
              disabled={!settings.data || mutation.isPending}
              label="알림 받을 시각"
              onChange={(hour) => mutation.mutate(hour)}
              value={settings.data?.sendHour ?? 9}
            />
          </span>
          {/* 시간대(Asia/Seoul) 글자는 뺐다(11/13 "적혀 있어야 해?"). 서버는 그대로 한국 시간 */}
          <small>넣을 상품이 있을 때만 보내요</small>
        </div>
      )}
      {(publicKey.isError || unavailable) && (
        <p className={styles.note}>
          {publicKey.isError &&
            (publicKey.error instanceof ApiError &&
            publicKey.error.code === 'PUSH_UNAVAILABLE'
              ? '알림 서비스를 준비 중이에요. '
              : '알림 연결 상태를 불러오지 못했어요. ')}
          {unavailable && '실제 사이트의 HTTPS PC 브라우저에서 켤 수 있어요.'}
        </p>
      )}
      <p className={styles.feedback} role="status">
        {mutation.isPending ? '설정을 저장하고 있어요…' : message}
      </p>
    </section>
  )
}
