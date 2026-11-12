import { useQueryClient } from '@tanstack/react-query'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '../../../shared/ui/Button/Button'
import { Confetti } from '../../../shared/ui/Confetti/Confetti'
import {
  billingPost,
  getSession,
  newIdempotencyKey,
  type SessionResult,
} from '../model/billingApi'
import { reasonText, returnPath } from '../model/payment'
import boxClosed from '../assets/box-closed.webp'
import boxOpen from '../assets/box-open.webp'
import styles from './Billing.module.css'
import { Steps } from './CheckoutPage'

const POLL_MS = 2000
// 서버 작업자가 1분 안에 결제하므로 90초까지 본다.
const POLL_MAX = 45

type Phase =
  | { kind: 'registering' }
  | { kind: 'checking' }
  | { kind: 'paid' }
  | { kind: 'replaced' }
  | { kind: 'failed'; reason: string; invoiceId?: number | string }
  | { kind: 'unknown' }

// 결제 성공·실패는 카드 등록과 따로 확인한다. 돈이 나갔다고 말하는 건 paymentStatus가 SUCCEEDED일 때뿐이다.
function verdict(session: SessionResult): Phase | null {
  const { status, paymentStatus, errorCode } = session
  if (paymentStatus === 'SUCCEEDED') return { kind: 'paid' }
  if (paymentStatus === 'DECLINED' || paymentStatus === 'VOID') {
    return {
      kind: 'failed',
      reason: reasonText(errorCode),
      invoiceId: session.invoiceId ?? undefined,
    }
  }
  if (status === 'REJECTED' || status === 'CANCELED' || status === 'EXPIRED') {
    return { kind: 'failed', reason: reasonText(errorCode) }
  }
  // 카드만 바꾼 경우(결제 없음)
  if (status === 'COMPLETED' && !session.invoiceId) return { kind: 'replaced' }
  return null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 주소에 남은 authKey가 기록에 남지 않게 지운다(라우터가 쓰는 history.state는 그대로 둔다).
function cleanAddress() {
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname,
  )
}

function Retry() {
  const navigate = useNavigate()
  return (
    <Button onClick={() => navigate(returnPath())} variant="secondary">
      다시 시도
    </Button>
  )
}

// 카드 등록창에서 성공하고 돌아온 화면: 등록 마무리(complete) → 결제 확인(2초마다 조회) → 결과
export function BillingAuthSuccessPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const [read] = useState(() => ({
    sessionId: params.get('sessionId'),
    state: params.get('state'),
    authKey: params.get('authKey'),
    customerKey: params.get('customerKey'),
  }))
  const [phase, setPhase] = useState<Phase>({ kind: 'registering' })
  const started = useRef(false)

  useEffect(() => {
    cleanAddress()
    // 개발 모드(StrictMode)에서 두 번 돌아도 등록 마무리는 한 번만 보낸다.
    if (started.current) return
    started.current = true
    const { sessionId, state, authKey, customerKey } = read
    async function run() {
      if (!sessionId || !state || !authKey || !customerKey) {
        setPhase({
          kind: 'failed',
          reason: '결제창에서 돌아온 정보가 비었어요',
        })
        return
      }
      try {
        await billingPost<SessionResult>(
          `/registration-sessions/${sessionId}/complete`,
          newIdempotencyKey(),
          { authKey, customerKey, state },
        )
      } catch {
        // 응답 유실·서버 오류만으로 승인 여부를 알 수 없다. 같은 세션을 조회하고
        // complete나 새 구독 요청을 자동으로 다시 보내지 않는다.
      }
      setPhase({ kind: 'checking' })
      for (let i = 0; i <= POLL_MAX; i++) {
        try {
          const done = verdict(await getSession(sessionId))
          if (done) {
            setPhase(done)
            void queryClient.invalidateQueries({ queryKey: ['billing'] })
            return
          }
        } catch {
          // 잠깐 연결이 끊겨도 결제 결과를 단정하지 않고 계속 본다.
        }
        await sleep(POLL_MS)
      }
      setPhase({ kind: 'unknown' })
    }
    void run()
  }, [read, queryClient])

  const failed = phase.kind === 'failed' ? phase : null
  return (
    <div className={styles.column}>
      <Steps at={phase.kind === 'paid' ? 2 : 1} />
      {(phase.kind === 'registering' || phase.kind === 'checking') && (
        <p className={styles.info} role="status">
          {phase.kind === 'registering'
            ? '카드를 등록하고 있어요'
            : '카드 등록과 결제 결과를 확인하고 있어요'}
        </p>
      )}
      {(phase.kind === 'paid' || phase.kind === 'replaced') && (
        <>
          <div className={styles.done} role="status">
            {/* 결제 완료(11/11): 우리 상자가 흔들리다 열리고 색종이가 터진다 */}
            {phase.kind === 'paid' && (
              <div aria-hidden="true" className={styles.boxStage}>
                <img alt="" className={styles.boxClosed} src={boxClosed} />
                <img alt="" className={styles.boxOpen} src={boxOpen} />
                <Confetti delayMs={720} />
              </div>
            )}
            {/* ✓는 제목 옆에(11/11) */}
            <div
              className={styles.doneTitle}
              data-rise-self=""
              style={
                {
                  '--rise-at': phase.kind === 'paid' ? '850ms' : '0ms',
                } as CSSProperties
              }
            >
              <span aria-hidden="true" className={styles.ring}>
                ✓
              </span>
              <h1>
                {phase.kind === 'paid' ? '결제됐어요' : '카드를 바꿨어요'}
              </h1>
            </div>
          </div>
          <Button
            data-rise-self=""
            onClick={() => navigate('/account')}
            style={
              {
                '--rise-at': phase.kind === 'paid' ? '1000ms' : '80ms',
              } as CSSProperties
            }
          >
            내 계정으로
          </Button>
        </>
      )}
      {phase.kind === 'unknown' && (
        <p className={styles.info} role="status">
          결제를 아직 확인하고 있어요. 잠시 뒤 내 계정에서 확인해 주세요.
        </p>
      )}
      {failed && (
        <>
          <div className={styles.safe} role="alert">
            <span aria-hidden="true">✓</span>
            {/* 첫 줄 굵게, 사유와 할 일은 다음 줄(11/12 — 한 문장이면 사유 중간에서 꺾임) */}
            <span className={styles.safeText}>
              <b>결제가 안 됐어요</b>
              <span>
                {failed.reason.replace(/[.\s]+$/, '')}. 같은 카드나 다른 카드로
                다시 해 주세요.
              </span>
            </span>
          </div>
          {failed.invoiceId != null ? (
            <Button onClick={() => navigate('/account')} variant="secondary">
              내 계정에서 다시 결제
            </Button>
          ) : (
            <Retry />
          )}
        </>
      )}
      {phase.kind === 'unknown' && (
        <Button onClick={() => navigate('/account')} variant="secondary">
          내 계정으로
        </Button>
      )}
    </div>
  )
}

// 카드 등록창에서 실패하거나 닫고 돌아온 화면: 결제사가 준 사유를 그대로 보여 준다.
export function BillingAuthFailPage() {
  const [params] = useSearchParams()
  const [read] = useState(() => ({
    code: params.get('code'),
    message: params.get('message'),
  }))
  useEffect(cleanAddress, [])
  return (
    <div className={styles.column}>
      <Steps at={1} />
      <div className={styles.safe} role="alert">
        <span aria-hidden="true">✓</span>
        <span className={styles.safeText}>
          <b>돈은 빠져나가지 않았어요</b>
          <span>{read.message ?? reasonText(read.code)}</span>
        </span>
      </div>
      <Retry />
    </div>
  )
}
