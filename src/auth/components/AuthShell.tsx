import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Tape } from '../../shared/ui/Tape/Tape'
import styles from './AuthShell.module.css'

type AuthShellProps = {
  tab: 'login' | 'signup'
  children: ReactNode
}

const tabs = [
  { id: 'login', to: '/login', label: '로그인' },
  { id: 'signup', to: '/signup', label: '회원가입' },
] as const

// 오른쪽 미리보기에 쓰는 예시 숫자. 실제 계정 값이 아니다.
const sampleItems = [
  { name: '덴탈껌 M 5입', quantity: 72 },
  { name: '연어 져키 80g', quantity: 40 },
  { name: '오리 큐브 100g', quantity: 24 },
]

// S01 로그인 · S02 회원가입이 함께 쓰는 틀: 왼쪽 입력 + 오른쪽 서비스 화면 미리보기
export function AuthShell({ tab, children }: AuthShellProps) {
  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <section className={styles.panel}>
          <p className={styles.brand}>
            <img alt="" height="32" src="/logo.png" width="32" />
            ITGO <small>입고 예측</small>
          </p>
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
        <aside aria-hidden="true" className={styles.preview}>
          <p className={styles.previewCaption}>
            수불부를 올리면
            <br />
            지금 넣을 상품을 알려드려요
          </p>
          <div className={styles.previewCard}>
            <Tape className={styles.tape} />
            <span>지금 넣어야 해요</span>
            <strong>3개</strong>
            <small>오늘 발주해야 제때 도착해요</small>
          </div>
          <ul className={styles.previewList}>
            {sampleItems.map((item) => (
              <li key={item.name}>
                <span>{item.name}</span>
                <b>권장 {item.quantity}개</b>
              </li>
            ))}
          </ul>
          <p className={styles.previewNote}>예시 화면이에요</p>
        </aside>
      </div>
    </main>
  )
}
