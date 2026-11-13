import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '../../../shared/ui/Button/Button'
import { Modal } from '../../../shared/ui/Modal/Modal'
import { dayOf, monthDayKo } from '../model/billing'
import {
  billingErrorText,
  useBillingMutation,
  useSubscription,
} from '../model/billingApi'
import type { ServerSubscription } from '../model/billingApi'
import { PlanCards } from '../pages/PlansPage'
import styles from './PlanGate.module.css'

// 선택 여부와 체험 종료일은 서버 원장으로 판단한다. 구버전 서버의 누락 필드는 기존 계정으로 취급한다.
export function PlanGate({ hasUpload }: { hasUpload: boolean }) {
  const titleId = useId()
  const navigate = useNavigate()
  const { data: subscription } = useSubscription()
  const trial = useBillingMutation<ServerSubscription>('/trial/start')
  const [started, setStarted] = useState<ServerSubscription | null>(null)
  const startTrial = async () => {
    try {
      const chosen = await trial.mutateAsync(undefined)
      if (chosen.planId === 'trial' && chosen.status === 'TRIALING')
        setStarted(chosen)
    } catch {
      // mutation의 오류를 창 안에 표시하고 같은 키로 재시도한다.
    }
  }
  const close = () => setStarted(null)
  if (started) {
    const end = started.trialEnd ? monthDayKo(dayOf(started.trialEnd)) : ''
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
  if (hasUpload || !subscription || subscription.planChosenAt !== null)
    return null
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
        {trial.isError && <p role="alert">{billingErrorText(trial.error)}</p>}
        <PlanCards
          onTrial={startTrial}
          subscription={subscription}
          trialPending={trial.isPending}
        />
      </div>
    </Modal>
  )
}
