import { useCallback, useEffect, useState } from 'react'

import styles from './Toast.module.css'

type ToastProps = {
  message: string
  onClose: () => void
  /** 이 시간(밀리초)이 지나면 저절로 사라진다. */
  duration?: number
}

// 사라질 때 나타난 길로 되돌아가는 시간. CSS의 --motion-exit과 같다.
const EXIT_MS = 420

export function Toast({ message, onClose, duration = 3000 }: ToastProps) {
  const [leaving, setLeaving] = useState(false)
  const leave = useCallback(() => setLeaving(true), [])

  useEffect(() => {
    const timer = setTimeout(leave, duration)
    return () => clearTimeout(timer)
  }, [duration, leave])

  // 사라지는 움직임이 끝난 뒤 닫는다. (움직임을 끈 사용자도 같은 시간 뒤 닫힘)
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(onClose, EXIT_MS)
    return () => clearTimeout(timer)
  }, [leaving, onClose])

  return (
    <div className={styles.toast} data-leaving={leaving} role="status">
      <span aria-hidden="true" className={styles.lines}>
        <i />
        <i />
        <i />
      </span>
      <span>{message}</span>
      <button aria-label="안내 닫기" onClick={leave} type="button">
        ×
      </button>
    </div>
  )
}
