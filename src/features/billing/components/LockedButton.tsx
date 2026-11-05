import { useId } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '../../../shared/ui/Button/Button'
import styles from './LockedButton.module.css'

// 계산을 막은 상태의 버튼(#214). disabled가 아니라 누를 수 있고, 누르면 요금제로 간다.
export function LockedButton({
  children,
  variant,
}: {
  children: string
  variant?: 'primary' | 'secondary'
}) {
  const navigate = useNavigate()
  const captionId = useId()
  return (
    <>
      <Button
        aria-describedby={captionId}
        onClick={() => navigate('/plans')}
        variant={variant}
      >
        <svg
          aria-hidden="true"
          className={styles.icon}
          fill="none"
          height="14"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="14"
        >
          <rect height="10" rx="2" width="16" x="4" y="11" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        {children}
      </Button>
      <span className={styles.caption} id={captionId}>
        요금제를 골라야 쓸 수 있어요
      </span>
    </>
  )
}
