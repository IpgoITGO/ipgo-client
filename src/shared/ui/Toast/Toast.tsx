import { useEffect } from 'react'

import styles from './Toast.module.css'

type ToastProps = {
  message: string
  onClose: () => void
  /** 이 시간(밀리초)이 지나면 저절로 사라진다. */
  duration?: number
}

export function Toast({ message, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div className={styles.toast} role="status">
      <span>{message}</span>
      <button aria-label="안내 닫기" onClick={onClose} type="button">
        ×
      </button>
    </div>
  )
}
