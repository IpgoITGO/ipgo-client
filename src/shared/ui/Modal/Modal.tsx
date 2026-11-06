import { type PropsWithChildren, useEffect, useRef } from 'react'

import styles from './Modal.module.css'

type ModalProps = PropsWithChildren<{
  labelledBy: string
  onClose: () => void
}>

export function Modal({ children, labelledBy, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  // 열릴 때 한 번만 창에 초점을 준다. onClose가 렌더마다 새 함수여도 다시 실행되지 않아야
  // 안의 입력칸(상품 검색 등)에서 글자를 칠 때마다 초점을 뺏기지 않는다.
  useEffect(() => {
    // 안에서 이미 초점을 잡은 버튼(autoFocus)이 있으면 그대로 둔다
    if (!dialogRef.current?.contains(document.activeElement)) {
      dialogRef.current?.focus()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        ref={dialogRef}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={styles.dialog}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  )
}
