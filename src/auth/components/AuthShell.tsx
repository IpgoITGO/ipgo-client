import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import cornerArt from '../../shared/assets/shop-shelf.webp'
import welcomeArt from '../assets/signup-welcome.webp'
import styles from './AuthShell.module.css'

type AuthShellProps = {
  tab: 'login' | 'signup'
  children: ReactNode
  /** 가입을 막 마치고 로그인으로 왔을 때만 첫 상자를 올리는 그림(11/13) */
  welcome?: boolean
}

const tabs = [
  { id: 'login', to: '/login', label: '로그인' },
  { id: 'signup', to: '/signup', label: '회원가입' },
] as const

// S01 로그인 · S02 회원가입이 함께 쓰는 틀: 왼쪽 입력 + 오른쪽 셀러 선반 그림(11/11 코덱스)
export function AuthShell({ tab, children, welcome = false }: AuthShellProps) {
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
        <aside
          aria-hidden="true"
          className={styles.preview}
          data-rise={welcome ? '' : undefined}
        >
          {welcome ? (
            <p className={styles.previewCaption}>
              가입을 마쳤어요
              <br />
              로그인하고 첫 수불부를 올려 보세요
            </p>
          ) : (
            <p className={styles.previewCaption}>
              수불부를 올리면
              <br />
              지금 넣을 상품을 알려드려요
            </p>
          )}
          <img
            alt=""
            className={styles.previewArt}
            data-welcome={welcome || undefined}
            src={welcome ? welcomeArt : cornerArt}
          />
        </aside>
      </div>
    </main>
  )
}
