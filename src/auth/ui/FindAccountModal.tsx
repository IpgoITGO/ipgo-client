import { type FormEvent, useEffect, useId, useState } from 'react'

import { ApiError } from '../../shared/api/client'
import { useActionLock } from '../../shared/hooks/useActionLock'
import { Button } from '../../shared/ui/Button/Button'
import { Modal } from '../../shared/ui/Modal/Modal'
import {
  findId,
  resetPassword,
  sendPasswordResetCode,
  verifyPasswordResetCode,
} from '../api/authApi'
import { PasswordField } from '../components/PasswordField'
import { PasswordStrength } from '../components/PasswordStrength'
import { TextField } from '../components/TextField'
import { messageOf } from '../model/authMessages'
import { PASSWORD_RULE } from '../model/passwordRule'
import styles from './FindAccountModal.module.css'

type Props = {
  onClose: () => void
  // 로그인 화면으로 돌아간다. email이 있으면 이메일 칸을 미리 채운다.
  onDone: (email?: string) => void
}

const STEPS = ['이메일', '인증 코드', '새 비밀번호'] as const
const RESEND_MS = 60_000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 가입 화면과 같은 000-00-00000 모양 (SignUpPage의 formatBusinessRegNo와 같은 규칙)
function formatBusinessNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  return [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5)]
    .filter(Boolean)
    .join('-')
}

export function FindAccountModal({ onClose, onDone }: Props) {
  const titleId = useId()
  const [tab, setTab] = useState<'id' | 'pw'>('id')

  return (
    <Modal labelledBy={titleId} onClose={onClose}>
      <div className={styles.root}>
        <h2 className={styles.title} id={titleId}>
          아이디·비밀번호 찾기
        </h2>
        <div className={styles.segments} role="tablist">
          {(
            [
              ['id', '아이디 찾기'],
              ['pw', '비밀번호 찾기'],
            ] as const
          ).map(([key, label]) => (
            <button
              aria-selected={tab === key}
              className={styles.segment}
              key={key}
              onClick={() => setTab(key)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'id' ? (
          <FindId onDone={onDone} />
        ) : (
          <ResetPassword onDone={onDone} />
        )}
      </div>
    </Modal>
  )
}

function FindId({ onDone }: Pick<Props, 'onDone'>) {
  const [number, setNumber] = useState('')
  const [error, setError] = useState<string>()
  const [masked, setMasked] = useState<string>()

  const search = useActionLock(async () => {
    setError(undefined)
    if (number.replaceAll('-', '').length !== 10) {
      setError('숫자 10자리로 입력해 주세요.')
      return
    }
    try {
      const result = await findId(number)
      setMasked(result.maskedEmail)
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'NOT_FOUND'
          ? '이 번호로 가입한 계정이 없어요.'
          : messageOf(e),
      )
    }
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (masked) onDone()
    else void search.run()
  }

  return (
    <form className={styles.panel} noValidate onSubmit={submit}>
      <div className={styles.content}>
        {masked ? (
          <div className={styles.result} role="status">
            <p className={styles.resultLabel}>가입한 이메일은</p>
            <p className={styles.resultValue}>{masked} 이에요</p>
          </div>
        ) : (
          <TextField
            autoFocus
            error={error}
            hint="가입할 때 적은 사업자등록번호로 찾아요."
            inputMode="numeric"
            label="사업자등록번호"
            maxLength={12}
            onChange={(event) =>
              setNumber(formatBusinessNumber(event.target.value))
            }
            placeholder="000-00-00000"
            value={number}
          />
        )}
      </div>
      {masked ? (
        <Button autoFocus className={styles.primary} type="submit">
          이 이메일로 로그인
        </Button>
      ) : (
        <Button
          className={styles.primary}
          loading={search.isPending}
          loadingLabel="찾는 중"
          type="submit"
        >
          아이디 찾기
        </Button>
      )}
    </form>
  )
}

function ResetPassword({ onDone }: Pick<Props, 'onDone'>) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string>()
  const [sentAt, setSentAt] = useState(0)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (step !== 2) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [step])

  const canResend = now - sentAt >= RESEND_MS
  const secondsLeft = Math.max(0, Math.ceil((sentAt + RESEND_MS - now) / 1000))

  // 처음 보내기와 다시 보내기가 같은 일을 한다
  const sendCode = useActionLock(async () => {
    setError(undefined)
    if (!EMAIL_RE.test(email.trim())) {
      setError('올바른 이메일 주소를 입력해 주세요.')
      return
    }
    try {
      await sendPasswordResetCode(email.trim())
      setCode('')
      setSentAt(Date.now())
      setNow(Date.now())
      setStep(2)
    } catch (e) {
      setError(messageOf(e))
    }
  })

  const verify = useActionLock(async () => {
    setError(undefined)
    if (!/^\d{6}$/.test(code)) {
      setError('6자리 숫자를 입력해 주세요.')
      return
    }
    try {
      const result = await verifyPasswordResetCode({
        email: email.trim(),
        code,
      })
      setToken(result.resetToken)
      setStep(3)
    } catch (e) {
      setError(messageOf(e))
    }
  })

  const save = useActionLock(async () => {
    setError(undefined)
    if (!PASSWORD_RULE.test(password)) {
      setError('아래 조건을 모두 채워 주세요.')
      return
    }
    if (password !== confirm) {
      setError('비밀번호가 서로 달라요.')
      return
    }
    try {
      await resetPassword({ resetToken: token, newPassword: password })
      setStep(4)
    } catch (e) {
      setError(messageOf(e))
    }
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (step === 1) void sendCode.run()
    else if (step === 2) void verify.run()
    else if (step === 3) void save.run()
    else onDone(email.trim())
  }

  const pending = sendCode.isPending || verify.isPending || save.isPending
  const label = ['코드 보내기', '확인', '비밀번호 바꾸기', '로그인하기'][
    step - 1
  ]

  return (
    <form className={styles.panel} noValidate onSubmit={submit}>
      <ol aria-label="진행 단계" className={styles.steps}>
        {STEPS.map((name, index) => (
          <li
            aria-current={step === index + 1 ? 'step' : undefined}
            data-on={step > index || undefined}
            key={name}
          >
            <span>{step > index + 1 ? '✓' : index + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      <div className={styles.content}>
        {step === 1 && (
          <TextField
            autoComplete="email"
            autoFocus
            error={error}
            hint="가입한 이메일로 6자리 코드를 보내 드려요."
            label="이메일"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seller@example.com"
            type="email"
            value={email}
          />
        )}
        {step === 2 && (
          <TextField
            autoComplete="one-time-code"
            autoFocus
            error={error}
            hint={
              <>
                메일로 보낸 6자리 코드를 넣어 주세요 ·{' '}
                <button
                  className={styles.linkButton}
                  disabled={!canResend || sendCode.isPending}
                  onClick={() => void sendCode.run()}
                  type="button"
                >
                  다시 보내기{canResend ? '' : ` ${secondsLeft}초`}
                </button>
              </>
            }
            inputClassName={styles.code}
            inputMode="numeric"
            label="인증 코드"
            maxLength={6}
            onChange={(event) => setCode(event.target.value)}
            value={code}
          />
        )}
        {step === 3 && (
          <div className={styles.stack}>
            <PasswordField
              autoComplete="new-password"
              autoFocus
              aria-invalid={error ? true : undefined}
              hint={<PasswordStrength value={password} />}
              label="새 비밀번호"
              onChange={(event) => setPassword(event.target.value)}
              value={password}
            />
            <PasswordField
              autoComplete="new-password"
              error={error}
              label="새 비밀번호 확인"
              onChange={(event) => setConfirm(event.target.value)}
              value={confirm}
            />
          </div>
        )}
        {step === 4 && (
          <div className={styles.result} role="status">
            <p className={styles.resultValue}>비밀번호를 바꿨어요</p>
            <p className={styles.resultLabel}>새 비밀번호로 로그인해 주세요.</p>
          </div>
        )}
      </div>
      <Button
        autoFocus={step === 4}
        className={styles.primary}
        loading={pending}
        loadingLabel="처리 중"
        type="submit"
      >
        {label}
      </Button>
    </form>
  )
}
