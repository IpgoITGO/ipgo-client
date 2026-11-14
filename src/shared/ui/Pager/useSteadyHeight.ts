import { useLayoutEffect, useRef } from 'react'

// 쪽을 넘겨 줄이 줄어도 표 높이를 지금까지 가장 높았던 만큼 잡아 둔다 → 아래 쪽 넘기기(1·2…)가 안 올라간다(11/14).
// resetKey(보기 개수·탭·검색 등)가 바뀌면 처음부터 다시 잰다. 표가 늦게 그려져도 놓치지 않게 그릴 때마다 잰다.
export function useSteadyHeight<T extends HTMLElement>(resetKey: string) {
  const ref = useRef<T>(null)
  const tallest = useRef({ key: '', height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (tallest.current.key !== resetKey) {
      tallest.current = { key: resetKey, height: 0 }
      el.style.minHeight = ''
    }
    const height = el.offsetHeight
    if (height > tallest.current.height) tallest.current.height = height
    el.style.minHeight = `${tallest.current.height}px`
  })
  return ref
}
