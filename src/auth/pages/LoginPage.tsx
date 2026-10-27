import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import { ApiError } from '../../shared/api/client'
import { useActionLock } from '../../shared/hooks/useActionLock'
import { Button } from '../../shared/ui/Button/Button'
import { useAuth } from '../model/useAuth'
import styles from './LoginPage.module.css'

const loginSchema = z.object({
  email: z.email('올바른 이메일 주소를 입력해 주세요.'),
  password: z.string().min(8, '비밀번호는 8자 이상 입력해 주세요.'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { signIn } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'seller@a.com',
      password: 'pass1234',
    },
  })

  // 성공하면 PublicOnly가 원래 가려던 화면으로 보냅니다.
  const { isPending, run } = useActionLock(async (values: LoginValues) => {
    setSubmitError(null)
    try {
      await signIn(values)
    } catch (error) {
      setSubmitError(
        error instanceof ApiError && error.code === 'LOGIN_FAILED'
          ? '이메일 또는 비밀번호가 맞지 않아요.'
          : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.',
      )
    }
  })

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit(run)}>
        <div>
          <p className={styles.eyebrow}>Ipgo</p>
          <h1>로그인</h1>
          <p className={styles.description}>
            현재는 MSW 시험 계정으로 동작합니다.
          </p>
        </div>
        <label className={styles.field}>
          <span>이메일</span>
          <input
            aria-invalid={Boolean(errors.email)}
            type="email"
            {...register('email')}
          />
          {errors.email && <small role="alert">{errors.email.message}</small>}
        </label>
        <label className={styles.field}>
          <span>비밀번호</span>
          <input
            aria-invalid={Boolean(errors.password)}
            type="password"
            {...register('password')}
          />
          {errors.password && (
            <small role="alert">{errors.password.message}</small>
          )}
        </label>
        {submitError && <p role="alert">{submitError}</p>}
        <Button loading={isPending} loadingLabel="로그인 중" type="submit">
          로그인
        </Button>
        <Link className={styles.link} to="/signup">
          회원가입
        </Link>
      </form>
    </main>
  )
}
