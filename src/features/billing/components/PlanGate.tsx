import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../../../auth/model/useAuth'
import { Button } from '../../../shared/ui/Button/Button'
import { Modal } from '../../../shared/ui/Modal/Modal'
import { dayOf, monthDayKo } from '../model/billing'
import { useSubscription } from '../model/billingApi'
import { PlanCards } from '../pages/PlansPage'
import styles from './PlanGate.module.css'

// 첫 대시보드(수불부 아직 없음)에서 요금제를 고르기 전엔 다른 걸 못 누르게 막는 창.
// 체험을 고르면 이 브라우저에 기억하고 닫는다. 셀러·비즈니스는 결제 화면으로(결제 안 하고 돌아오면 다시 뜸).
const KEY = 'ipgo:plan-picked:'
function picked(email: string) {
  try {
    return localStorage.getItem(KEY + email) === '1'
  } catch {
    return false
  }
}

export function PlanGate({ hasUpload }: { hasUpload: boolean }) {
  const titleId = useId()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: subscription } = useSubscription()
  const email = user?.email ?? ''
  const [done, setDone] = useState(() => picked(email))
  const [started, setStarted] = useState(false)
  if (
    hasUpload ||
    (done && !started) ||
    !subscription ||
    subscription.planId !== 'trial' ||
    subscription.status !== 'TRIALING'
  )
    return null
  const startTrial = () => {
    try {
      localStorage.setItem(KEY + email, '1')
    } catch {
      /* 기억 못 하면 다음에 한 번 더 묻는다 */
    }
    setDone(true)
    setStarted(true)
  }
  const close = () => setStarted(false)
  if (started) {
    const end = subscription.trialEnd
      ? monthDayKo(dayOf(subscription.trialEnd))
      : ''
    // 체험 시작 확인(11/12): 꾸밈 없이 한 메시지 + 다음 할 일
    return (
      <Modal dismissible={false} labelledBy={titleId}>
        <div className={styles.started}>
          <span aria-hidden="true" className={styles.check}>
            <svg viewBox="0 0 24 24">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <h2 className={styles.title} id={titleId}>
            14일 체험을 시작했어요
          </h2>
          <p className={styles.sub}>
            {end}까지 셀러와 똑같이 써요. 카드 등록은 필요 없어요.
          </p>
          <div className={styles.next}>
            <Button onClick={() => navigate('/upload')}>
              수불부 올리러 가기
            </Button>
            <Button onClick={close} variant="secondary">
              닫기
            </Button>
          </div>
        </div>
      </Modal>
    )
  }
  return (
    <Modal dismissible={false} labelledBy={titleId} wide>
      <div className={styles.body}>
        <h2 className={styles.title} id={titleId}>
          어떤 요금제로 시작할까요?
        </h2>
        <p className={styles.sub}>
          골라야 수불부를 올릴 수 있어요. 체험은 카드 등록 없이 14일 동안 셀러와
          똑같이 써요.
        </p>
        <PlanCards onTrial={startTrial} subscription={subscription} />
      </div>
    </Modal>
  )
}
