import { useEffect, useState } from 'react'

import {
  checkEmailAvailability,
  confirmVerificationCode,
  sendVerificationCode,
} from '../api/authApi'
import { EMAIL_EXISTS_MESSAGE, messageOf } from './authMessages'

const RESEND_INTERVAL_MS = 60_000

// idle: 아직 확인 전 · unavailable: 쓸 수 없거나 확인에 실패 · available: 코드 발송 전
// codeSent: 코드 입력 대기 · verified: 인증 완료
type Step = 'idle' | 'unavailable' | 'available' | 'codeSent' | 'verified'

type State = {
  email: string
  step: Exclude<Step, 'idle'>
  sentAt?: number
  expiresAt?: number
  token?: string
  error?: string
  codeError?: string
}

// 이메일 중복 확인(A5) → 인증 코드 발송(A6) → 코드 확인(A7) 흐름.
// 단계는 어느 이메일에 대한 것인지 함께 기억하므로, 이메일을 고치면 처음부터 다시 합니다.
export function useEmailVerification(email: string) {
  const [state, setState] = useState<State | null>(null)
  const current = state?.email === email ? state : null
  const step: Step = current?.step ?? 'idle'
  const tick = useTick(step === 'codeSent')
  const sentAt = current?.sentAt

  async function sendCode(target: string) {
    try {
      const { expiresIn } = await sendVerificationCode(target)
      const now = Date.now()
      setState({
        email: target,
        step: 'codeSent',
        sentAt: now,
        expiresAt: now + expiresIn * 1000,
      })
    } catch (error) {
      setState((previous) =>
        previous?.email === target
          ? { ...previous, error: messageOf(error) }
          : { email: target, step: 'available', error: messageOf(error) },
      )
    }
  }

  // 중복 확인에 통과하면 이어서 인증 코드를 보냅니다.
  async function checkAndSend() {
    let result: { available: boolean }
    try {
      result = await checkEmailAvailability(email)
    } catch (error) {
      setState({ email, step: 'unavailable', error: messageOf(error) })
      return
    }

    if (!result.available) {
      setState({ email, step: 'unavailable', error: EMAIL_EXISTS_MESSAGE })
      return
    }

    setState({ email, step: 'available' })
    await sendCode(email)
  }

  async function confirm(code: string) {
    try {
      const { verificationToken } = await confirmVerificationCode({
        email,
        code,
      })
      setState({ email, step: 'verified', token: verificationToken })
    } catch (error) {
      setState((previous) =>
        previous?.email === email
          ? { ...previous, codeError: messageOf(error) }
          : previous,
      )
    }
  }

  return {
    step,
    token: current?.token,
    error: current?.error,
    codeError: current?.codeError,
    expiresAt: current?.expiresAt,
    resendAt: sentAt === undefined ? undefined : sentAt + RESEND_INTERVAL_MS,
    // 코드를 보낸 순간보다 앞선 시각이 나오지 않게 합니다.
    now: Math.max(tick, sentAt ?? 0),
    checkAndSend,
    resend: () => sendCode(email),
    confirm,
  }
}

// 남은 시간을 1초마다 새로 그리기 위한 현재 시각
function useTick(active: boolean) {
  const [tick, setTick] = useState(Date.now)

  useEffect(() => {
    if (!active) return

    const timer = window.setInterval(() => setTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])

  return tick
}
