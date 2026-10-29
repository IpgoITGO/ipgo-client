import { useEffect, useState } from 'react'

// 숫자가 0부터 목표값까지 올라간다. (React Bits Count Up 아이디어를 의존성 없이)
// 움직임 줄이기 설정이거나 브라우저가 지원하지 않으면 바로 목표값을 보여준다.
export function useCountUp(target: number, duration = 650) {
  const animate =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [value, setValue] = useState(animate ? 0 : target)

  useEffect(() => {
    if (!animate) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [animate, duration, target])

  return animate ? value : target
}
