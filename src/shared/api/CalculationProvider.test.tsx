import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../../mocks/server'
import {
  CalculationStatus,
  DONE_MS,
} from '../ui/CalculationStatus/CalculationStatus'
import { useCalculation } from './calculationContext'
import { CalculationProvider } from './CalculationProvider'
import * as runApi from './calculationRunApi'
import { readTrackedRun } from './calculationStorage'

function Harness({
  getResult = async () => '새 계산 결과',
}: {
  getResult?: () => Promise<string>
}) {
  const { trackRun, busy, runId } = useCalculation()
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: getResult,
    staleTime: Infinity,
  })
  return (
    <>
      <button onClick={() => trackRun(71)}>계산 번호 받기</button>
      <button onClick={() => trackRun(72)}>새 계산 번호 받기</button>
      <button onClick={() => trackRun(null)}>계산 없음</button>
      <button disabled={busy}>다시 계산</button>
      <span>{dashboard.data}</span>
      <span data-testid="tracked-run">{runId ?? '없음'}</span>
      <CalculationStatus />
    </>
  )
}

function setup(
  timeout = 2000,
  getResult?: () => Promise<string>,
  storageScope?: string,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['dashboard'], '이전 정상 결과')
  client.setQueryData(['sku', '3'], { old: true })
  const view = render(
    <QueryClientProvider client={client}>
      <CalculationProvider
        pollInterval={20}
        timeout={timeout}
        storageScope={storageScope}
      >
        <Harness getResult={getResult} />
      </CalculationProvider>
    </QueryClientProvider>,
  )
  return { client, user: userEvent.setup(), unmount: view.unmount }
}

describe('계산 완료·실패 추적', () => {
  it('취소 응답이 늦어도 로컬 추적과 저장 번호를 즉시 지우고 실패 뒤 새로고침해도 복원하지 않는다', async () => {
    let reject!: (error: Error) => void
    const cancel = vi.spyOn(runApi, 'cancelCalculationRun').mockImplementation(
      () =>
        new Promise<boolean>((_resolve, rejectRequest) => {
          reject = rejectRequest
        }),
    )
    server.use(
      http.get('/api/calculation-runs/71', () =>
        HttpResponse.json({ runId: 71, status: 'RUNNING' }),
      ),
    )
    try {
      const { user, unmount } = setup(2000, undefined, 'stop-test')
      await user.click(screen.getByText('계산 번호 받기'))
      expect(readTrackedRun('stop-test')).toBe(71)
      await user.click(
        await screen.findByRole('button', { name: '계산 멈추기' }),
      )
      expect(cancel).toHaveBeenCalledExactlyOnceWith(71)
      expect(screen.getByText('다시 계산')).toBeEnabled()
      expect(screen.getByTestId('tracked-run')).toHaveTextContent('없음')
      expect(readTrackedRun('stop-test')).toBeNull()
      unmount()
      setup(2000, undefined, 'stop-test')
      expect(screen.getByTestId('tracked-run')).toHaveTextContent('없음')
      await act(async () => {
        reject(new Error('합성 취소 실패'))
      })
      expect(screen.getByText('다시 계산')).toBeEnabled()
      expect(readTrackedRun('stop-test')).toBeNull()
    } finally {
      cancel.mockRestore()
    }
  })

  it('이전 취소 응답이 도착해도 새 계산과 새 저장 번호를 보존한다', async () => {
    let resolve!: (accepted: boolean) => void
    const cancel = vi.spyOn(runApi, 'cancelCalculationRun').mockImplementation(
      () =>
        new Promise<boolean>((resolveRequest) => {
          resolve = resolveRequest
        }),
    )
    server.use(
      http.get('/api/calculation-runs/:id', ({ params }) =>
        HttpResponse.json({ runId: Number(params.id), status: 'RUNNING' }),
      ),
    )
    try {
      const { user } = setup(2000, undefined, 'race-test')
      await user.click(screen.getByText('계산 번호 받기'))
      await user.click(
        await screen.findByRole('button', { name: '계산 멈추기' }),
      )
      await user.click(screen.getByText('새 계산 번호 받기'))
      expect(screen.getByTestId('tracked-run')).toHaveTextContent('72')
      await act(async () => {
        resolve(true)
      })
      expect(screen.getByTestId('tracked-run')).toHaveTextContent('72')
      expect(screen.getByText('다시 계산')).toBeDisabled()
      expect(readTrackedRun('race-test')).toBe(72)
    } finally {
      cancel.mockRestore()
    }
  })

  it('계산은 DONE이어도 결과 갱신 실패는 알리고 조회만 재시도한다', async () => {
    let available = false
    server.use(
      http.get('/api/calculation-runs/71', () =>
        HttpResponse.json({ runId: 71, status: 'DONE' }),
      ),
    )
    const { user } = setup(2000, async () => {
      if (!available) throw new Error('합성 읽기 오류')
      return '갱신된 결과'
    })
    await user.click(screen.getByText('계산 번호 받기'))
    expect(
      await screen.findByText('계산은 끝났지만 새 결과를 불러오지 못했어요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('이전 정상 결과')).toBeInTheDocument()
    available = true
    await user.click(screen.getByText('상태 다시 확인'))
    expect(await screen.findByText('갱신된 결과')).toBeInTheDocument()
    expect(await screen.findByText('계산을 마쳤어요')).toBeInTheDocument()
  })
  it('QUEUED→RUNNING→DONE을 따라가고 완료 뒤에만 결과를 갱신하고 조회를 멈춘다', async () => {
    let status = 'QUEUED'
    let reads = 0
    server.use(
      http.get('/api/calculation-runs/71', () => {
        reads++
        return HttpResponse.json({
          runId: 71,
          status,
          summary: { needCount: 3 },
        })
      }),
    )
    const { client, user } = setup()
    await user.click(screen.getByText('계산 번호 받기'))
    expect(
      await screen.findByText('계산을 기다리고 있어요'),
    ).toBeInTheDocument()
    expect(screen.getByText('이전 정상 결과')).toBeInTheDocument()
    expect(screen.getByText('다시 계산')).toBeDisabled()
    status = 'RUNNING'
    expect(
      await screen.findByText('입고량을 계산하고 있어요'),
    ).toBeInTheDocument()
    status = 'DONE'
    expect(await screen.findByText('계산을 마쳤어요')).toBeInTheDocument()
    expect(await screen.findByText('새 계산 결과')).toBeInTheDocument()
    expect(client.getQueryState(['sku', '3'])?.isInvalidated).toBe(true)
    expect(
      screen.getByText('입고가 필요한 상품은 3개예요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('다시 계산')).toBeEnabled()
    const stopped = reads
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(reads).toBe(stopped)
  })

  it('FAILED이면 실패 사유를 보여주고 이전 정상 결과를 지우거나 다시 계산하지 않는다', async () => {
    server.use(
      http.get('/api/calculation-runs/71', () =>
        HttpResponse.json({
          runId: 71,
          status: 'FAILED',
          errorMessage: '정제 자료를 확인해 주세요',
        }),
      ),
    )
    const { client, user } = setup()
    await user.click(screen.getByText('계산 번호 받기'))
    expect(
      await screen.findByText('정제 자료를 확인해 주세요'),
    ).toBeInTheDocument()
    expect(screen.getByText('이전 정상 결과')).toBeInTheDocument()
    expect(client.getQueryState(['sku', '3'])?.isInvalidated).toBe(false)
    expect(screen.getByText('다시 계산')).toBeEnabled()
  })

  it('상태 조회 오류는 계산 실패와 구분하고 같은 runId의 GET만 다시 확인한다', async () => {
    let available = false
    let writes = 0
    server.use(
      http.get('/api/calculation-runs/71', () =>
        available
          ? HttpResponse.json({ runId: 71, status: 'DONE' })
          : HttpResponse.json(
              { code: 'TEMPORARY', message: '잠시 기다려 주세요' },
              { status: 503 },
            ),
      ),
      http.post('*', () => {
        writes++
        return new HttpResponse(null, { status: 500 })
      }),
    )
    const { user } = setup()
    await user.click(screen.getByText('계산 번호 받기'))
    expect(
      await screen.findByText('계산 상태를 확인하지 못했어요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('다시 계산')).toBeDisabled()
    available = true
    await user.click(screen.getByText('상태 다시 확인'))
    expect(await screen.findByText('계산을 마쳤어요')).toBeInTheDocument()
    expect(writes).toBe(0)
  })

  it('확인 시간 초과는 실패로 단정하지 않고 같은 계산 조회를 재개한다', async () => {
    let status = 'RUNNING'
    server.use(
      http.get('/api/calculation-runs/71', () =>
        HttpResponse.json({ runId: 71, status }),
      ),
    )
    const { user } = setup(80)
    await user.click(screen.getByText('계산 번호 받기'))
    expect(
      await screen.findByText('계산 결과를 확인하는 데 시간이 걸리고 있어요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('이전 정상 결과')).toBeInTheDocument()
    status = 'DONE'
    await user.click(screen.getByText('상태 다시 확인'))
    expect(await screen.findByText('계산을 마쳤어요')).toBeInTheDocument()
  })

  it('서로 다른 runId 응답을 완료로 표시하지 않는다', async () => {
    server.use(
      http.get('/api/calculation-runs/71', () =>
        HttpResponse.json({ runId: 72, status: 'DONE' }),
      ),
    )
    const { user } = setup()
    await user.click(screen.getByText('계산 번호 받기'))
    expect(
      await screen.findByText('계산 상태를 확인하지 못했어요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('이전 정상 결과')).toBeInTheDocument()
  })

  it('runId가 없으면 계산을 만들거나 완료됐다고 알리지 않는다', async () => {
    const { user } = setup()
    await user.click(screen.getByText('계산 없음'))
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: '입고량 계산 상태' }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByText('다시 계산')).toBeEnabled()
  })
  it('마친 알림은 5초 뒤 내려가고, 마우스를 올려 두면 멈춘다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      server.use(
        http.get('/api/calculation-runs/71', () =>
          HttpResponse.json({ runId: 71, status: 'DONE' }),
        ),
      )
      setup()
      fireEvent.click(screen.getByText('계산 번호 받기'))
      await screen.findByText('계산을 마쳤어요')
      const box = screen.getByLabelText('입고량 계산 상태')
      fireEvent.mouseEnter(box)
      act(() => vi.advanceTimersByTime(DONE_MS + 500))
      expect(screen.getByText('계산을 마쳤어요')).toBeInTheDocument()
      fireEvent.mouseLeave(box)
      act(() => vi.advanceTimersByTime(DONE_MS + 500))
      expect(screen.queryByText('계산을 마쳤어요')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
