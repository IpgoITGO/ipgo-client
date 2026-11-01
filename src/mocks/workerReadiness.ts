// MSW 3.0.3의 MOCK_ACTIVATE/MOCKING_ENABLED 프로토콜을 사용한다.
// 생성된 mockServiceWorker.js는 수정하지 않으며 MSW 업그레이드 시 함께 검증한다.
export function createMockWorkerReadiness(
  serviceWorker: ServiceWorkerContainer,
  workerUrl: string,
  timeoutMs = 3000,
) {
  let pending: Promise<void> | null = null

  return function ensureReady(): Promise<void> {
    if (pending) return pending

    pending = new Promise<void>((resolve, reject) => {
      let target: ServiceWorker | null = null
      const timeout = setTimeout(
        () => finish(new Error('모의 서버의 준비 응답을 받지 못했습니다.')),
        timeoutMs,
      )

      function finish(error?: Error) {
        clearTimeout(timeout)
        serviceWorker.removeEventListener('message', onMessage)
        serviceWorker.removeEventListener('controllerchange', activate)
        if (error) reject(error)
        else resolve()
      }

      function onMessage(event: MessageEvent) {
        if (
          !target ||
          event.source !== target ||
          event.data?.type !== 'MOCKING_ENABLED'
        ) {
          return
        }
        if (serviceWorker.controller !== target) {
          finish(new Error('모의 서버가 준비 도중 변경됐습니다.'))
          return
        }
        // 워커가 message 이벤트의 처리를 마칠 수 있도록 응답 포트를 해제한다.
        event.ports[0]?.postMessage({})
        event.ports[0]?.close()
        finish()
      }

      function activate() {
        const controller = serviceWorker.controller
        if (target && controller !== target) {
          finish(new Error('모의 서버가 준비 도중 변경됐습니다.'))
          return
        }
        // 최초 로드의 clients.claim()이 끝나지 않았으면 제한 시간 안에서 기다린다.
        if (!controller) return
        if (
          controller.scriptURL !== workerUrl ||
          controller.state === 'redundant'
        ) {
          finish(new Error('현재 페이지의 모의 서버를 확인할 수 없습니다.'))
          return
        }
        target = controller
        try {
          controller.postMessage('MOCK_ACTIVATE')
        } catch {
          finish(new Error('모의 서버에 준비 요청을 보내지 못했습니다.'))
        }
      }

      serviceWorker.addEventListener('message', onMessage)
      serviceWorker.addEventListener('controllerchange', activate)
      activate()
    }).finally(() => {
      pending = null
    })

    return pending
  }
}
