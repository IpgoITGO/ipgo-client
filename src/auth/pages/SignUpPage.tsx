import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { useActionLock } from '../../shared/hooks/useActionLock'
import { Button } from '../../shared/ui/Button/Button'
import { signUp } from '../api/authApi'
import { AuthShell } from '../components/AuthShell'
import { FieldButton } from '../components/FieldButton'
import { TextField } from '../components/TextField'
import {
  EMAIL_VERIFICATION_REQUIRED_MESSAGE,
  messageOf,
} from '../model/authMessages'
import { useEmailVerification } from '../model/useEmailVerification'
import styles from './SignUpPage.module.css'

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label}을 입력해 주세요.`)
    .max(50, '50자까지 입력할 수 있어요.')

// 화면 검사는 편의용이고 최종 판단은 백엔드가 합니다. (API 명세 3.1절)
const signUpSchema = z
  .object({
    companyName: name('회사명'),
    businessRegNo: z
      .string()
      .refine(
        (value) => value === '' || /^\d{10}$/.test(value.replaceAll('-', '')),
        '숫자 10자리로 입력해 주세요.',
      ),
    managerName: name('담당자 이름'),
    email: z.email('올바른 이메일 주소를 입력해 주세요.'),
    // 서버 규칙: 12~128자 (글자 종류 제한 없음)
    password: z
      .string()
      .min(12, '12자 이상 입력해 주세요.')
      .max(128, '128자까지 입력할 수 있어요.'),
    passwordConfirm: z.string(),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    path: ['passwordConfirm'],
    message: '비밀번호가 서로 달라요.',
  })

type SignUpValues = z.infer<typeof signUpSchema>

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')

  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function SignUpPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    trigger,
    control,
    formState: { errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      companyName: '',
      businessRegNo: '',
      managerName: '',
      email: '',
      password: '',
      passwordConfirm: '',
    },
  })
  const email = useWatch({ control, name: 'email' })
  const verification = useEmailVerification(email)

  const { step, expiresAt, resendAt, now } = verification
  const isCodeStep = step === 'codeSent'
  const isExpired = isCodeStep && expiresAt !== undefined && now >= expiresAt
  const canResend = isCodeStep && resendAt !== undefined && now >= resendAt

  const checkEmail = useActionLock(async () => {
    if (await trigger('email')) await verification.checkAndSend()
  })
  const sendCode = useActionLock(async () => {
    setCode('')
    await verification.resend()
  })
  const confirmCode = useActionLock(async () => {
    await verification.confirm(code)
  })
  const submit = useActionLock(async (values: SignUpValues) => {
    if (step !== 'verified' || !verification.token) {
      setError('email', { message: EMAIL_VERIFICATION_REQUIRED_MESSAGE })
      return
    }

    setSubmitError(null)
    try {
      await signUp({
        companyName: values.companyName,
        businessRegNo: values.businessRegNo.replaceAll('-', '') || null,
        managerName: values.managerName,
        email: values.email,
        password: values.password,
        verificationToken: verification.token,
      })
      navigate('/login', { replace: true, state: { signedUp: values.email } })
    } catch (error) {
      setSubmitError(messageOf(error))
    }
  })

  const emailHint =
    step === 'verified'
      ? '인증을 마쳤어요.'
      : step === 'available' || isCodeStep
        ? '사용할 수 있는 이메일이에요.'
        : undefined

  return (
    <AuthShell
      description="올린 수불부와 계산 결과는 우리 회사 계정에서만 볼 수 있어요."
      headline={'회사 정보와\n이메일 인증으로\n시작해요'}
      steps={[
        { label: '회사 정보', active: true },
        {
          label: '이메일 중복 확인 · 인증',
          active: step !== 'idle' && step !== 'unavailable',
        },
        { label: '비밀번호', active: step === 'verified' },
      ]}
      tab="signup"
    >
      <form
        className={styles.form}
        noValidate
        onSubmit={handleSubmit(submit.run)}
      >
        <h1 className={styles.srOnly}>회원가입</h1>
        <h2 className={styles.title}>계정을 만들어요</h2>

        <section aria-labelledby="signup-company" className={styles.block}>
          <h3 className={styles.section} id="signup-company">
            1 · 회사 정보
          </h3>
          <div className={styles.grid}>
            <TextField
              error={errors.companyName?.message}
              label="회사명 (상호)"
              required
              {...register('companyName')}
            />
            <TextField
              error={errors.businessRegNo?.message}
              inputMode="numeric"
              label={
                <>
                  사업자등록번호 <span className={styles.optional}>(선택)</span>
                </>
              }
              placeholder="000-00-00000"
              {...register('businessRegNo')}
            />
            <div className={styles.wide}>
              <TextField
                error={errors.managerName?.message}
                label="담당자 이름"
                required
                {...register('managerName')}
              />
            </div>
          </div>
        </section>

        <section aria-labelledby="signup-email" className={styles.block}>
          <h3 className={styles.section} id="signup-email">
            2 · 이메일
          </h3>
          <div className={styles.stack}>
            <TextField
              action={
                <FieldButton
                  disabled={
                    checkEmail.isPending || isCodeStep || step === 'verified'
                  }
                  onClick={() => void checkEmail.run()}
                >
                  {step === 'available' ? '인증 코드 받기' : '중복 확인'}
                </FieldButton>
              }
              autoComplete="email"
              error={errors.email?.message ?? verification.error}
              hint={emailHint}
              label="이메일"
              required
              success={Boolean(emailHint) && !verification.error}
              type="email"
              {...register('email')}
            />
            {isCodeStep && (
              <TextField
                action={
                  <FieldButton
                    disabled={
                      isExpired || code.length === 0 || confirmCode.isPending
                    }
                    onClick={() => void confirmCode.run()}
                    variant="solid"
                  >
                    확인
                  </FieldButton>
                }
                autoComplete="one-time-code"
                error={
                  isExpired
                    ? '시간이 지났어요. 코드를 다시 받아 주세요.'
                    : verification.codeError
                }
                hint={
                  <>
                    메일로 6자리 코드를 보냈어요 · 10분 안에 입력 ·{' '}
                    <button
                      className={styles.linkButton}
                      disabled={!canResend || sendCode.isPending}
                      onClick={() => void sendCode.run()}
                      type="button"
                    >
                      다시 보내기
                      {!canResend && resendAt !== undefined
                        ? ` ${formatTime(resendAt - now)}`
                        : ''}
                    </button>
                  </>
                }
                inputClassName={styles.code}
                inputMode="numeric"
                label="인증 코드"
                maxLength={6}
                onChange={(event) => setCode(event.target.value)}
                suffix={
                  expiresAt !== undefined && (
                    <span aria-label="남은 시간" className={styles.timer}>
                      {formatTime(expiresAt - now)}
                    </span>
                  )
                }
                value={code}
              />
            )}
          </div>
        </section>

        <section aria-labelledby="signup-password" className={styles.block}>
          <h3 className={styles.section} id="signup-password">
            3 · 비밀번호
          </h3>
          <div className={styles.grid}>
            <TextField
              autoComplete="new-password"
              error={errors.password?.message}
              label="비밀번호"
              required
              type="password"
              {...register('password')}
            />
            <TextField
              autoComplete="new-password"
              error={errors.passwordConfirm?.message}
              label="비밀번호 확인"
              required
              type="password"
              {...register('passwordConfirm')}
            />
          </div>
          {!errors.password && (
            <p className={styles.note}>12자 이상으로 정해 주세요.</p>
          )}
        </section>

        {submitError && (
          <p className={styles.banner} role="alert">
            {submitError}
          </p>
        )}
        <Button
          className={styles.submit}
          loading={submit.isPending}
          loadingLabel="가입 중"
          type="submit"
        >
          가입하기
        </Button>
        <p className={styles.footnote}>
          이메일 인증을 마쳐야 가입할 수 있어요 · 가입이 끝나면 로그인 화면으로
          이동해요
        </p>
      </form>
    </AuthShell>
  )
}
