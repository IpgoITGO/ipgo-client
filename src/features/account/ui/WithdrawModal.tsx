import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PasswordField } from '../../../auth/components/PasswordField'
import { useAuth } from '../../../auth/model/useAuth'
import { ApiError, apiRequest } from '../../../shared/api/client'
import { Button } from '../../../shared/ui/Button/Button'
import { queueRouteToast } from '../../../app/ui/routeToastQueue'
import { Modal } from '../../../shared/ui/Modal/Modal'
import { getProductSettings } from '../../settings/model/inboundSettingsApi'
import { getPlannedReceipts } from '../../settings/model/plannedReceiptsApi'
import { getUploadPeriods } from '../../upload/model/uploadApi'
import styles from './WithdrawModal.module.css'

type Props = {
  /** 구독이 살아 있으면(해지 전 유료) 함께 해지된다고 알린다 */
  subscribed: boolean
  planName?: string
  /** 다음 결제일(= 이미 낸 기간이 끝나는 날) */
  usableUntil?: string | null
  onClose: () => void
}

// 줄마다 작은 선 아이콘(그림 대신, 11/11 "상자 이미지 별로")
const ICON = {
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  box: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  cart: 'M4 5h2l2 10h10l2-7H7M10 20h.01M17 20h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  card: 'M3 6h18v12H3zM3 10h18',
}
function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" className={styles.icon} viewBox="0 0 24 24">
      <path d={d} />
    </svg>
  )
}

export function WithdrawModal({
  subscribed,
  planName,
  usableUntil,
  onClose,
}: Props) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const { signOutLocally, user } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  // 무엇이 지워지는지 내 자료의 실제 숫자로 보여 준다(11/11 "확실히 뭐가 없어지는지")
  const periods = useQuery({
    queryKey: ['upload-periods'],
    queryFn: getUploadPeriods,
  })
  const products = useQuery({
    queryKey: ['products', 'count'],
    queryFn: getProductSettings,
  })
  const receipts = useQuery({
    queryKey: ['planned-receipts'],
    queryFn: getPlannedReceipts,
  })
  const months = (periods.data?.items ?? []).map((item) => item.period).sort()
  const rows: { icon: string; name: string; value: string }[] = [
    { icon: ICON.account, name: '계정', value: user?.email ?? '로그인 정보' },
    {
      icon: ICON.file,
      name: '올린 수불부',
      value: months.length
        ? `${months.length}개월 · ${months[0]} ~ ${months.at(-1)}`
        : '없어요',
    },
    {
      icon: ICON.box,
      name: '상품·입고 조건',
      value: products.data ? `상품 ${products.data.total}개` : '모두',
    },
    {
      icon: ICON.cart,
      name: '발주 기록',
      value: receipts.data ? `${receipts.data.total}건` : '모두',
    },
    { icon: ICON.chart, name: '계산 결과·AI 설명', value: '모두' },
    ...(subscribed
      ? [
          {
            icon: ICON.card,
            name: '구독',
            value: `${planName ?? '요금제'} 해지${usableUntil ? ` · ${usableUntil} 뒤 결제 없음` : ''}`,
          },
        ]
      : []),
  ]

  // 열릴 때 제목에 초점
  useEffect(() => titleRef.current?.focus(), [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    if (!password) {
      setError('비밀번호를 입력해 주세요.')
      return
    }
    setPending(true)
    setError(undefined)
    try {
      // ponytail: server API 아직 없음(POST /api/account/withdraw), 생기면 경로만 맞추기
      await apiRequest<void>('/account/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '탈퇴하지 못했어요.')
      setPending(false)
      return
    }
    // 계정이 이미 없어졌으니 서버 로그아웃 없이 이 화면에서만 잊는다.
    // 로그아웃되면 로그인 지키는 장치가 /login으로 보내며 location.state를 덮으므로 안내는 따로 맡겨 둔다
    queueRouteToast('탈퇴했어요. 그동안 고마웠어요')
    signOutLocally()
    navigate('/login', { replace: true })
  }

  return (
    <Modal labelledBy={titleId} onClose={onClose}>
      <form className={styles.body} noValidate onSubmit={submit}>
        {/* 한 화면(11/11, 레퍼런스 Notion·Bonsai): 지워지는 것 → 비밀번호 → 버튼. 단계가 없어 높이가 안 바뀌고 빈 공간도 없다 */}
        <h2 className={styles.title} id={titleId} ref={titleRef} tabIndex={-1}>
          탈퇴하면 아래 자료가 모두 지워져요
        </h2>
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.name}>
              <Icon d={row.icon} />
              <span>{row.name}</span>
              <b>{row.value}</b>
            </li>
          ))}
        </ul>
        <PasswordField
          autoComplete="current-password"
          error={error}
          label="확인을 위해 비밀번호를 넣어 주세요"
          onChange={(e) => {
            setPassword(e.target.value)
            setError(undefined)
          }}
          value={password}
        />
        <p className={styles.note}>지운 자료는 되살릴 수 없어요.</p>
        <div className={styles.actions}>
          {/* 남는 쪽이 노란 주 버튼, 마지막 확인은 진짜 버튼 모양의 빨간 버튼 */}
          <Button onClick={onClose} type="button">
            그대로 쓸게요
          </Button>
          <button className={styles.danger} disabled={pending} type="submit">
            {pending ? '탈퇴하는 중' : '탈퇴하기'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
