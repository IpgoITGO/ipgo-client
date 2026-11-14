import type { MouseEvent, SyntheticEvent } from 'react'

// 접는 칸(details)을 펴거나 접어도 누른 제목 줄이 화면에서 움직이지 않게 한다(11/13).
// 마우스를 그대로 두면 제목이 여전히 마우스 아래에 있다.
// 접혀서 페이지가 짧아지면 스크롤이 끝에 걸려 제목이 아래로 밀리므로, 그만큼 아래에 빈 자리를 더한다.
let summaryTop: number | null = null

export function rememberSummary(event: MouseEvent<HTMLElement>) {
  summaryTop = event.currentTarget.getBoundingClientRect().top
}

export function keepSummaryInPlace(
  event: SyntheticEvent<HTMLDetailsElement>,
  // 맨 아래 칸(보관 비용)은 접은 뒤 빈 자리가 남으면 어색해서 빈 자리를 더하지 않는다(11/13)
  { pad = true }: { pad?: boolean } = {},
) {
  const before = summaryTop
  summaryTop = null
  const summary = event.currentTarget.querySelector('summary')
  if (before === null || !summary) return
  const root = document.documentElement
  // 펼쳐서 길어지면 더해 둔 빈 자리는 필요 없다
  if (event.currentTarget.open) root.style.paddingBottom = ''
  const shift = () => summary.getBoundingClientRect().top - before
  window.scrollBy(0, shift())
  const left = shift()
  if (!pad) {
    root.style.paddingBottom = ''
    return
  }
  if (left > 1) {
    root.style.paddingBottom = `${(parseFloat(root.style.paddingBottom) || 0) + left}px`
    window.scrollBy(0, shift())
  }
}
