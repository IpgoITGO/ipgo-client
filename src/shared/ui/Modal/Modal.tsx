import { type PropsWithChildren, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import styles from './Modal.module.css'

type ModalProps = PropsWithChildren<{
  labelledBy: string
  onClose?: () => void
  /** false면 바깥 누르기·Esc로 닫히지 않고 뒤 화면도 못 누른다(요금제 고르기) */
  dismissible?: boolean
  wide?: boolean
}>

export function Modal({
  children,
  labelledBy,
  onClose,
  dismissible = true,
  wide = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const openerRef = useRef(document.activeElement)
  const lastFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    closeRef.current = onClose
  })

  // 못 닫는 창이면 뒤 화면을 통째로 막는다(키보드 Tab으로도 못 감)
  useEffect(() => {
    const root = document.getElementById('root')
    if (dismissible || !root) return
    root.inert = true
    return () => {
      root.inert = false
    }
  }, [dismissible])

  // 열릴 때 한 번만 창에 초점을 준다. onClose가 렌더마다 새 함수여도 다시 실행되지 않아야
  // 안의 입력칸(상품 검색 등)에서 글자를 칠 때마다 초점을 뺏기지 않는다.
  useEffect(() => {
    // 안에서 이미 초점을 잡은 버튼(autoFocus)이 있으면 그대로 둔다
    if (!dialogRef.current?.contains(document.activeElement)) {
      if (lastFocusRef.current?.isConnected) lastFocusRef.current.focus()
      else dialogRef.current?.focus()
    }

    const dialog = dialogRef.current
    const opener = openerRef.current
    return () => {
      // StrictMode의 효과 재설정에서도 autoFocus로 잡은 내부 초점을 유지한다.
      if (
        document.activeElement instanceof HTMLElement &&
        dialog?.contains(document.activeElement)
      ) {
        lastFocusRef.current = document.activeElement
      }
      // 다른 화면이나 다른 모달로 이동한 초점은 빼앗지 않는다.
      if (
        opener instanceof HTMLElement &&
        opener.isConnected &&
        (document.activeElement === document.body ||
          dialog?.contains(document.activeElement))
      ) {
        opener.focus()
      }
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const dialogs = document.querySelectorAll(
        '[role="dialog"][aria-modal="true"]',
      )
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return
      if (event.key === 'Escape' && dismissible) closeRef.current?.()
      // 못 닫는 창은 Tab 초점이 창 안에서만 돈다(뒤 화면은 inert라 못 감)
      const dialog = dialogRef.current
      if (event.key !== 'Tab' || dismissible || !dialog) return
      const items = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled])',
        ),
      ]
      if (!items.length) return
      const at = document.activeElement
      const edge = event.shiftKey ? items[0] : items[items.length - 1]
      if (at === edge || !dialog.contains(at)) {
        event.preventDefault()
        ;(event.shiftKey ? items[items.length - 1] : items[0]).focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dismissible])

  // 화면 전환 효과(transform)가 있는 본문 안에 두면 fixed가 본문 기준이 되어 배경이 덜 덮인다 → body로 띄운다
  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={dismissible ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={styles.dialog}
        data-wide={wide || undefined}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
