import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useAuth } from '../../auth/model/useAuth'
import { Button } from '../../shared/ui/Button/Button'
import styles from './AppLayout.module.css'
import { RouteToast } from './RouteToast'

const navigation = [
  { to: '/dashboard', label: '대시보드' },
  { to: '/settings', label: '입고 조건' },
]

export function AppLayout() {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()

  function handleSignOut() {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink className={styles.brand} to="/dashboard">
          입고 예측
        </NavLink>
        <nav aria-label="주요 메뉴" className={styles.navigation}>
          {navigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.active}` : styles.link
              }
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.account}>
          <span
            aria-label={`${user?.name} · ${user?.companyName}`}
            className={styles.identity}
          >
            {user?.name} <span aria-hidden="true">·</span> {user?.companyName}
          </span>
          <Button onClick={handleSignOut} variant="secondary">
            로그아웃
          </Button>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <RouteToast />
    </div>
  )
}
