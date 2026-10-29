import { type PropsWithChildren, useEffect, useRef } from 'react'

import { Tape } from '../Tape/Tape'
import styles from './Modal.module.css'

type ModalProps = PropsWithChildren<{
  labelledBy: string
  onClose: () => void
}>

export function Modal({ children, labelledBy, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

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
        <Tape className={styles.tape} />
        {children}
      </div>
    </div>
  )
}
