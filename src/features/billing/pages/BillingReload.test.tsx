import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../../../mocks/server'
import { openApp } from '../../../test/openApp'

describe('결제 복귀 화면의 새로고침 복구', () => {
  const done = {
    sessionId: 'reload-session',
    status: 'COMPLETED',
    invoiceId: 'invoice',
    paymentStatus: 'SUCCEEDED',
    errorCode: null,
  }

  it('세션 ID만 남은 주소는 complete를 재전송하지 않고 실제 승인을 조회한다', async () => {
    const complete = vi.fn(() => HttpResponse.json({}, { status: 202 }))
    const get = vi.fn(() => HttpResponse.json(done))
    server.use(
      http.post('/api/billing/registration-sessions/:id/complete', complete),
      http.get('/api/billing/registration-sessions/reload-session', get),
    )
    await openApp('/billing/auth/success?sessionId=reload-session')
    expect(await screen.findByText('결제됐어요')).toBeInTheDocument()
    expect(complete).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledOnce()
    expect(screen.queryByText('결제가 안 됐어요')).not.toBeInTheDocument()
  })

  it('대기 중 새로고침한 세션도 승인될 때까지 같은 세션을 조회한다', async () => {
    let calls = 0
    const complete = vi.fn(() => HttpResponse.json({}, { status: 202 }))
    server.use(
      http.post('/api/billing/registration-sessions/:id/complete', complete),
      http.get('/api/billing/registration-sessions/reload-session', () =>
        HttpResponse.json({
          ...done,
          paymentStatus: ++calls === 1 ? 'READY' : 'SUCCEEDED',
        }),
      ),
    )
    await openApp('/billing/auth/success?sessionId=reload-session')
    expect(await screen.findByText('결제됐어요')).toBeInTheDocument()
    expect(calls).toBe(2)
    expect(complete).not.toHaveBeenCalled()
  })

  it('복구할 세션조차 없으면 결제 실패로 단정하거나 다시 결제하도록 하지 않는다', async () => {
    await openApp('/billing/auth/success')
    expect(
      await screen.findByText(/결제를 아직 확인하고 있어요/),
    ).toBeInTheDocument()
    expect(screen.queryByText('결제가 안 됐어요')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '다시 시도' }),
    ).not.toBeInTheDocument()
  })

  it('서버가 만료 상태를 주면 결제사 거절 대신 이용시간 만료로 안내한다', async () => {
    server.use(
      http.get('/api/billing/registration-sessions/reload-session', () =>
        HttpResponse.json({
          ...done,
          status: 'EXPIRED',
          invoiceId: null,
          paymentStatus: null,
        }),
      ),
    )
    await openApp(
      '/billing/auth/success?sessionId=reload-session&state=s&authKey=a&customerKey=c',
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '결제창 이용 시간이 지났어요',
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      '결제사에서 결제를 거절했어요',
    )
    expect(window.location.search).toBe('?sessionId=reload-session')
  })
})
