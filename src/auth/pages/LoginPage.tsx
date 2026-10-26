import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '../../shared/ui/Button/Button'
import { useAuth } from '../model/useAuth'
import styles from './LoginPage.module.css'

const loginSchema = z.object({
  email: z.email('올바른 이메일 주소를 입력해 주세요.'),
  password: z.string().min(8, '비밀번호는 8자 이상 입력해 주세요.'),
})

type LoginValues = z.infer<typeof loginSchema>

type LocationState = {
  from?: {
    pathname?: string
  }
}

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
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

  function onSubmit(values: LoginValues) {
    const state = location.state as LocationState | null
    signIn(values.email)
    navigate(state?.from?.pathname ?? '/dashboard', { replace: true })
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit(onSubmit)}>
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
        <Button type="submit">로그인</Button>
        <Link className={styles.link} to="/signup">
          회원가입
        </Link>
      </form>
    </main>
  )
}
