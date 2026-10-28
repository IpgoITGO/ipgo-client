import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'react-router-dom'
import { z } from 'zod'

import { ApiError } from '../../shared/api/client'
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

export function LoginPage() {
  const { signIn } = useAuth()
  // 회원가입을 마치고 왔다면 가입한 이메일을 미리 채워 줍니다.
  const signedUp = (useLocation().state as { signedUp?: string } | null)
    ?.signedUp
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: signedUp ?? '', password: '' },
  })

  // 성공하면 PublicOnly가 원래 가려던 화면으로 보냅니다.
  const { isPending, run } = useActionLock(async (values: LoginValues) => {
    setSubmitError(null)
    try {
      await signIn(values)
    } catch (error) {
      setSubmitError(
        error instanceof ApiError && error.code === 'INVALID_CREDENTIALS'
          ? '이메일 또는 비밀번호가 맞지 않아요.'
          : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.',
      )
    }
  })

  return (
    <AuthShell
      headline={'다음 입고,\n몇 개 넣을지\n근거와 함께 알려드려요'}
      steps={[
        { label: '풀필먼트 수불부를 그대로 올려요' },
        { label: '지금 넣어야 할 상품과 권장 수량을 봐요' },
        { label: '더·덜 넣을 때를 비교하고 정해요' },
      ]}
      tab="login"
    >
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
