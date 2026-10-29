import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'react-router-dom'
import { z } from 'zod'

import { ApiError, CONNECTION_FAILED } from '../../shared/api/client'
import { useActionLock } from '../../shared/hooks/useActionLock'
import { Button } from '../../shared/ui/Button/Button'
import { AuthShell } from '../components/AuthShell'
import { TextField } from '../components/TextField'
import { useAuth } from '../model/useAuth'
import styles from './LoginPage.module.css'

const loginSchema = z.object({
  email: z.email('올바른 이메일 주소를 입력해 주세요.'),
  password: z.string().min(1, '비밀번호를 입력해 주세요.'),
})

type LoginValues = z.infer<typeof loginSchema>

// 아이디 저장: 체크하면 다음에 이메일을 미리 채운다. 이 브라우저에만 남는다.
const SAVED_EMAIL_KEY = 'ipgo:saved-email'

function readSavedEmail() {
  try {
    return localStorage.getItem(SAVED_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeSavedEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(SAVED_EMAIL_KEY, email)
    else localStorage.removeItem(SAVED_EMAIL_KEY)
  } catch {
    // 저장소를 못 쓰는 브라우저(시크릿 창 등)에서는 그냥 넘어간다.
  }
}

export function LoginPage() {
  const { signIn } = useAuth()
  // 회원가입을 마치고 왔다면 가입한 이메일을 미리 채워 줍니다.
  const signedUp = (useLocation().state as { signedUp?: string } | null)
    ?.signedUp
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [savedEmail] = useState(readSavedEmail)
  const [saveEmail, setSaveEmail] = useState(savedEmail !== '')
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: signedUp ?? savedEmail, password: '' },
  })

  // 성공하면 PublicOnly가 원래 가려던 화면으로 보냅니다.
  const { isPending, run } = useActionLock(async (values: LoginValues) => {
    setSubmitError(null)
    try {
      await signIn(values)
      writeSavedEmail(saveEmail ? values.email : null)
    } catch (error) {
      setSubmitError(
        error instanceof ApiError && error.code === 'INVALID_CREDENTIALS'
          ? '이메일 또는 비밀번호가 맞지 않아요.'
          : error instanceof ApiError && error.code === CONNECTION_FAILED
            ? error.message
            : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.',
      )
    }
  })

  return (
    <AuthShell tab="login">
      <form className={styles.form} noValidate onSubmit={handleSubmit(run)}>
        <h1 className={styles.srOnly}>로그인</h1>
        <h2 className={styles.title}>다시 오신 걸 환영해요</h2>
        {signedUp && (
          <p className={styles.notice} role="status">
            가입을 마쳤어요. 로그인해 주세요.
          </p>
        )}
        <div className={styles.fields}>
          <TextField
            autoComplete="email"
            error={errors.email?.message}
            label="이메일"
            placeholder="seller@example.com"
            type="email"
            {...register('email')}
          />
          <TextField
            autoComplete="current-password"
            error={errors.password?.message ?? submitError ?? undefined}
            label="비밀번호"
            type="password"
            {...register('password')}
          />
        </div>
        <label className={styles.remember}>
          <input
            checked={saveEmail}
            onChange={(event) => setSaveEmail(event.target.checked)}
            type="checkbox"
          />
          아이디 저장
        </label>
        <Button
          className={styles.submit}
          loading={isPending}
          loadingLabel="로그인 중"
          type="submit"
        >
          로그인
        </Button>
        <p className={styles.footnote}>소셜 로그인은 추후 제공해요</p>
      </form>
    </AuthShell>
  )
}
