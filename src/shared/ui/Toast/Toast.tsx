import { useEffect, useState } from 'react'

import { Tape } from '../Tape/Tape'
import styles from './Toast.module.css'

type ToastProps = {
  message: string
  onClose: () => void
  /** 이 시간(밀리초)이 지나면 저절로 사라진다. */
  duration?: number
}

// 사라질 때 나타난 길로 되돌아가는 시간. CSS의 --motion-exit과 같다.
const EXIT_MS = 420

// 잠깐 알리고 저절로 사라지는 안내라 닫기 버튼은 두지 않는다.
export function Toast({ message, onClose, duration = 1500 }: ToastProps) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setLeaving(true), duration)
    return () => clearTimeout(timer)
  }, [duration])

  // 사라지는 움직임이 끝난 뒤 닫는다. (움직임을 끈 사용자도 같은 시간 뒤 닫힘)
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(onClose, EXIT_MS)
    return () => clearTimeout(timer)
  }, [leaving, onClose])

  return (
    <div className={styles.toast} data-leaving={leaving} role="status">
      <Tape className={styles.tape} />
      <span aria-hidden="true" className={styles.lines}>
        <i />
        <i />
        <i />
      </span>
      <span>{message}</span>
    </div>
  )
}
