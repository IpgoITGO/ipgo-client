// 로그아웃처럼 로그인 지키는 장치가 먼저 화면을 옮겨 location.state가 덮일 수 있는 경우에 쓴다.
// 다음에 붙는 RouteToast가 한 번 꺼내 보여 준다(11/11 — 탈퇴 안내가 경쟁 상태로 사라지던 것).
let queued: string | null = null

export function queueRouteToast(message: string) {
  queued = message
}

export function takeQueuedToast() {
  const message = queued
  queued = null
  return message
}
