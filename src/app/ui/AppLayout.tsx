import { useState, useSyncExternalStore } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../../auth/model/useAuth'
import {
  loadSubscription,
  onSubscriptionChange,
  planOf,
  subscriptionSnapshot,
  trialDaysLeft,
} from '../../features/billing/model/billing'
import { useActionLock } from '../../shared/hooks/useActionLock'
import { Button } from '../../shared/ui/Button/Button'
import { CalculationStatus } from '../../shared/ui/CalculationStatus/CalculationStatus'
import { Modal } from '../../shared/ui/Modal/Modal'
import styles from './AppLayout.module.css'
import { AccountMenu } from './AccountMenu'
import { RouteToast } from './RouteToast'

const navigation = [
  { to: '/dashboard', label: '대시보드' },
  { to: '/settings', label: '입고 조건' },
]

export function AppLayout() {
  const { signOut, signOutLocally, user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // 서버 로그아웃이 실패하면 화면을 떠나기 전에 팝업으로 알린다(시안 "가", #32).
  // 새로고침 복구가 있어서, 실패를 넘기면 다시 열었을 때 로그인된 채로 열릴 수 있다.
  const [logoutFailed, setLogoutFailed] = useState(false)
  const { isPending: signingOut, run: handleSignOut } = useActionLock(
    async () => {
      try {
        await signOut()
        setLogoutFailed(false)
        navigate('/login', { replace: true })
      } catch {
        setLogoutFailed(true)
      }
    },
  )

  // 지금 요금제 알약(#186). 체험이면 남은 날을 같이 보여 준다. 누르면 요금제 화면.
  // 결제하면 저장 알림을 받아 바로 다시 그린다.
  useSyncExternalStore(onSubscriptionChange, subscriptionSnapshot)
  const subscription = loadSubscription()
  const planLabel =
    subscription.plan === 'trial'
      ? `체험 ${trialDaysLeft(subscription)}일 남음`
      : planOf(subscription.plan).name

  function leaveAnyway() {
    setLogoutFailed(false)
    signOutLocally()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink className={styles.brand} to="/dashboard">
          <img alt="" height="36" src="/logo.png" width="36" />
          ITGO
          <small>입고 예측</small>
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
          <NavLink
            aria-label={`지금 요금제: ${planLabel}`}
            className={styles.planPill}
            to="/plans"
          >
            {planLabel}
          </NavLink>
          <AccountMenu
            company={user?.companyName ?? ''}
            name={user?.name ?? ''}
            onSignOut={() => void handleSignOut()}
            signingOut={signingOut && !logoutFailed}
          />
        </div>
      </header>
      <main className={styles.main}>
        {pathname.replace(/\/$/, '') !== '/dashboard' && <CalculationStatus />}
        {/* 주소가 바뀔 때마다 새로 그려 짧은 페이드 인이 한 번 돈다. */}
        <div className={styles.page} key={pathname}>
          <Outlet />
        </div>
      </main>
      <RouteToast />
      {logoutFailed && (
        <Modal
          labelledBy="logout-failed-title"
          onClose={() => setLogoutFailed(false)}
        >
          <div className={styles.logoutFailed}>
            <span aria-hidden="true" className={styles.logoutIcon}>
              !
            </span>
            <h2 id="logout-failed-title">로그아웃을 끝내지 못했어요</h2>
            <p>
              서버에 연결하지 못해서 아직 로그인이 남아 있어요. 이대로 나가면 이
              컴퓨터에서 다시 열었을 때 로그인된 채로 열릴 수 있어요.
            </p>
            <div className={styles.logoutActions}>
              <Button onClick={leaveAnyway} variant="text">
                그래도 이 화면에서 나가기
              </Button>
              <Button
                loading={signingOut}
                loadingLabel="다시 시도하는 중"
                onClick={() => void handleSignOut()}
              >
                다시 시도
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
