import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMockWorkerReadiness } from './workerReadiness'

const workerUrl = 'http://localhost/mockServiceWorker.js'

function fixture(initialController = true) {
  const worker = {
    scriptURL: workerUrl,
    state: 'activated',
    postMessage: vi.fn(),
  } as unknown as ServiceWorker
  let controller: ServiceWorker | null = initialController ? worker : null
  const events = new EventTarget()
  Object.defineProperty(events, 'controller', { get: () => controller })
  const container = events as ServiceWorkerContainer
  const message = (
    source: ServiceWorker = worker,
    type = 'MOCKING_ENABLED',
  ) => {
    const port = { postMessage: vi.fn(), close: vi.fn() }
    events.dispatchEvent(
      new MessageEvent('message', {
        source,
        data: { type },
        ports: [port as unknown as MessagePort],
      }),
    )
    return port
  }
  const change = (next: ServiceWorker | null) => {
    controller = next
    events.dispatchEvent(new Event('controllerchange'))
  }
  return { worker, container, message, change }
}

afterEach(() => vi.useRealTimers())

describe('모의 워커 준비 확인', () => {
  it('동시 요청은 한 번의 재등록을 공유하고 현재 워커의 응답을 기다린다', async () => {
    const { worker, container, message } = fixture()
    const ensureReady = createMockWorkerReadiness(container, workerUrl)
    const first = ensureReady()
    const second = ensureReady()
    expect(first).toBe(second)
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith('MOCK_ACTIVATE')
    const done = vi.fn()
    void first.then(done)
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    const port = message()
    await first
    expect(done).toHaveBeenCalledOnce()
    expect(port.postMessage).toHaveBeenCalledOnce()
    expect(port.close).toHaveBeenCalledOnce()
  })

  it('앞선 준비가 성공해도 다음 요청은 다시 확인해 재시작된 워커를 복구한다', async () => {
    const { worker, container, message } = fixture()
    const ensureReady = createMockWorkerReadiness(container, workerUrl)
    const first = ensureReady()
    message()
    await first
    const next = ensureReady()
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    message()
    await next
  })

  it('다른 워커나 다른 종류의 메시지로 준비를 완료하지 않는다', async () => {
    const { container, message } = fixture()
    const ensureReady = createMockWorkerReadiness(container, workerUrl)
    const done = vi.fn()
    const pending = ensureReady().then(done)
    message({} as ServiceWorker)
    message(undefined, 'KEEPALIVE_RESPONSE')
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    message()
    await pending
    expect(done).toHaveBeenCalledOnce()
  })

  it('최초 페이지 제어권을 얻으면 제한 시간 안에서 준비를 이어간다', async () => {
    const { worker, container, change, message } = fixture(false)
    const pending = createMockWorkerReadiness(container, workerUrl)()
    expect(worker.postMessage).not.toHaveBeenCalled()
    change(worker)
    message()
    await pending
    expect(worker.postMessage).toHaveBeenCalledOnce()
  })

  it('준비 응답이 없으면 제한 시간 뒤 실패하고 다음 사용자 요청은 다시 시도할 수 있다', async () => {
    vi.useFakeTimers()
    const { worker, container, message } = fixture()
    const ensureReady = createMockWorkerReadiness(container, workerUrl, 100)
    const remove = vi.spyOn(container, 'removeEventListener')
    const failure = expect(ensureReady()).rejects.toThrow('준비 응답')
    await vi.advanceTimersByTimeAsync(100)
    await failure
    expect(remove).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
    const next = ensureReady()
    message()
    await next
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('준비 중 제어 워커가 바뀌면 실패하고 새 요청에서 새 워커를 확인한다', async () => {
    const { worker, container, change, message } = fixture()
    const ensureReady = createMockWorkerReadiness(container, workerUrl)
    const failure = expect(ensureReady()).rejects.toThrow('변경')
    const replacement = {
      scriptURL: workerUrl,
      state: 'activated',
      postMessage: vi.fn(),
    } as unknown as ServiceWorker
    change(replacement)
    message(worker)
    await failure
    const next = ensureReady()
    message(replacement)
    await next
    expect(replacement.postMessage).toHaveBeenCalledOnce()
  })

  it('다른 서비스 워커나 전송 실패에서는 외부 요청을 허용하지 않는다', async () => {
    const { worker, container, change } = fixture()
    change({
      scriptURL: 'http://localhost/other.js',
      state: 'activated',
    } as ServiceWorker)
    await expect(
      createMockWorkerReadiness(container, workerUrl)(),
    ).rejects.toThrow('확인')
    change(worker)
    vi.mocked(worker.postMessage).mockImplementation(() => {
      throw new Error('중단')
    })
    await expect(
      createMockWorkerReadiness(container, workerUrl)(),
    ).rejects.toThrow('보내지 못')
  })
})
