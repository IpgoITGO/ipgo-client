import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import styles from './AuthShell.module.css'

type AuthShellProps = {
  tab: 'login' | 'signup'
  headline: string
  description?: string
  steps: { label: string; active?: boolean }[]
  children: ReactNode
}

const tabs = [
  { id: 'login', to: '/login', label: '로그인' },
  { id: 'signup', to: '/signup', label: '회원가입' },
] as const

// S01 로그인 · S02 회원가입이 함께 쓰는 틀: 왼쪽 소개 영역 + 오른쪽 탭 카드
export function AuthShell({
  tab,
  headline,
  description,
  steps,
  children,
}: AuthShellProps) {
  return (
    <main className={styles.page}>
      <div className={styles.layout} data-tab={tab}>
        <aside className={styles.intro}>
          <p className={styles.brand}>
            <img alt="" height="40" src="/logo.png" width="40" />
            ITGO <small>입고 예측</small>
          </p>
          <p className={styles.headline}>{headline}</p>
          {description && <p className={styles.description}>{description}</p>}
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li
                className={styles.step}
                data-active={step.active || undefined}
                key={step.label}
              >
                <span aria-hidden="true" className={styles.stepNumber}>
                  {index + 1}
                </span>
                {step.label}
              </li>
            ))}
          </ol>
        </aside>
        <section className={styles.panel}>
          <nav aria-label="로그인과 회원가입" className={styles.tabs}>
            {tabs.map((item) => (
              <Link
                aria-current={item.id === tab ? 'page' : undefined}
                className={styles.tab}
                key={item.id}
                to={item.to}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {children}
        </section>
      </div>
    </main>
  )
}
