import { useEffect, useState } from 'react'

import { useCalculation } from '../../api/calculationContext'
import { CalcMark } from '../CalcMark/CalcMark'
import styles from './CalcLockHint.module.css'

// 계산 중이라 잠긴 칸([data-calc-locked])에 마우스를 올리면 커서 옆에 "계산 중" 그림이 따라다닌다(11/12).
// 잠긴 칸은 pointer-events: none(base.css)이라 이벤트가 부모로 가서, 칸 영역으로 직접 맞춰 본다.
// (꺼진 버튼엔 브라우저에 따라 마우스 이벤트가 안 오기도 한다.) 화면 읽기는 각 화면의 안내 글이 맡는다.
export function CalcLockHint() {
  const { busy } = useCalculation()
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!busy) return
    let frame = 0
    const onMove = (event: PointerEvent) => {
      const { clientX: x, clientY: y } = event
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const hit = [...document.querySelectorAll('[data-calc-locked]')].some(
          (element) => {
            const box = element.getBoundingClientRect()
            return (
              x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
            )
          },
        )
        setAt(hit ? { x, y } : null)
      })
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', onMove)
      setAt(null)
    }
  }, [busy])

  if (!busy || !at) return null
  return (
    <div
      aria-hidden="true"
      className={styles.hint}
      // 화살표 커서 바로 오른쪽 아래에 붙인다(11/12 — 떨어져 있으면 더 번잡해 보임)
      style={{ transform: `translate(${at.x + 11}px, ${at.y + 11}px)` }}
    >
      <CalcMark state="running" />
      <span>계산 중이에요</span>
    </div>
  )
}
