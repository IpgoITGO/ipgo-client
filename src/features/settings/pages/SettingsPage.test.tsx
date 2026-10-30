import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../../../app/providers/AppProviders'
import { server } from '../../../mocks/server'
import { RouteToast } from '../../../app/ui/RouteToast'
import { DashboardPage } from '../../dashboard/pages/DashboardPage'
import { SettingsPage } from './SettingsPage'

describe('SettingsPage', () => {
  it('확인하고 계산하기가 저장되면 대시보드로 가서 토스트를 보여준다', async () => {
    const user = userEvent.setup()
    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route element={<SettingsPage />} path="/settings" />
            <Route element={<DashboardPage />} path="/dashboard" />
          </Routes>
          <RouteToast />
        </MemoryRouter>
      </AppProviders>,
    )

    await screen.findByText('케어트릿 120g')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))

    expect(
      await screen.findByText('입고 조건을 저장했어요'),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: /지금 넣어야 할 상품이 6개/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '확인하고 계산하기' }),
    ).toBeNull()
  })

  it('상품을 검색하고 잘못된 입고 단위를 차단한다', async () => {
    const user = userEvent.setup()
    render(
      <AppProviders>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </AppProviders>,
    )

    expect(await screen.findByText('케어트릿 120g')).toBeInTheDocument()
    await user.type(screen.getByLabelText('상품명 또는 바코드 검색'), '덴탈껌')
    const productSection = screen
      .getByRole('heading', { name: '상품별로 다른 조건' })
      .closest('section')
    expect(productSection).not.toBeNull()
    expect(
      within(productSection!).getByText('덴탈껌 S 10입'),
    ).toBeInTheDocument()
    expect(
      within(productSection!).queryByText('케어트릿 120g'),
    ).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('덴탈껌 S 10입 inboundUnit'))
    await user.type(screen.getByLabelText('덴탈껌 S 10입 inboundUnit'), '0')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('1 이상의 정수')
  })

  function renderSettings() {
    return render(
      <AppProviders>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </AppProviders>,
    )
  }

  it('사용 스위치를 끄면 서버에 저장하고, 새로 불러와도 꺼져 있다', async () => {
    const user = userEvent.setup()
    const first = renderSettings()
    const sw = await screen.findByRole('switch', { name: '덴탈껌 S 10입 사용' })
    expect(sw).toBeChecked()
    // 업로드에 안 나와 서버가 꺼 둔 상품은 꺼진 채로 보인다
    expect(
      screen.getByRole('switch', { name: '단종 간식 30g 사용' }),
    ).not.toBeChecked()

    await user.click(sw)
    await waitFor(() => expect(sw).not.toBeDisabled())
    expect(sw).not.toBeChecked()
    expect(
      await screen.findByText('✓ 덴탈껌 S 10입 껐어요 · 저장됨'),
    ).toBeInTheDocument()

    first.unmount()
    renderSettings()
    expect(
      await screen.findByRole('switch', { name: '덴탈껌 S 10입 사용' }),
    ).not.toBeChecked()
  })

  it('사용 스위치를 끄면 대시보드도 다시 불러와 그 상품이 빠진다', async () => {
    const user = userEvent.setup()
    render(
      <AppProviders>
        <MemoryRouter>
          <SettingsPage />
          <DashboardPage />
        </MemoryRouter>
      </AppProviders>,
    )
    expect(
      await screen.findByRole('heading', { name: /지금 넣어야 할 상품이 6개/ }),
    ).toBeInTheDocument()

    await user.click(
      await screen.findByRole('switch', { name: '덴탈껌 S 10입 사용' }),
    )

    expect(
      await screen.findByRole('heading', { name: /지금 넣어야 할 상품이 5개/ }),
    ).toBeInTheDocument()
  })

  it('사용 여부 저장에 실패하면 스위치를 되돌리고 알려 준다', async () => {
    const user = userEvent.setup()
    server.use(
      http.patch('/api/products/:productId', () =>
        HttpResponse.json(
          { code: 'FORBIDDEN', message: '다른 회원의 상품입니다.' },
          { status: 403 },
        ),
      ),
    )
    renderSettings()
    const sw = await screen.findByRole('switch', { name: '덴탈껌 S 10입 사용' })
    await user.click(sw)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '다른 회원의 상품입니다.',
    )
    expect(sw).toBeChecked()
  })

  it('바꾼 상품만 저장하고, 마지막에 기본값 저장과 함께 계산을 시작한다', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT') calls.push(new URL(request.url).pathname)
    })
    renderSettings()
    const field = await screen.findByLabelText('덴탈껌 S 10입 inboundUnit')
    await user.clear(field)
    await user.type(field, '6')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))

    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls).toEqual([
      '/api/products/3/replenishment-settings',
      '/api/replenishment-settings',
    ])
    server.events.removeAllListeners()
  })
})

describe('SettingsPage 표 모양', () => {
  it('원가는 쉼표로 보여 주고, 쉼표를 빼고 숫자로 저장한다', async () => {
    const user = userEvent.setup()
    const sent: unknown[] = []
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'PUT' && request.url.includes('/products/')) {
        sent.push(await request.clone().json())
      }
    })
    render(
      <AppProviders>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </AppProviders>,
    )
    const cost = await screen.findByLabelText('덴탈껌 S 10입 cost')
    expect(cost).toHaveValue('1,800')

    await user.clear(cost)
    await user.type(cost, '25000')
    expect(cost).toHaveValue('25,000')
    await user.click(screen.getByRole('button', { name: '확인하고 계산하기' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ unitCost: 25000 })
    server.events.removeAllListeners()
  })

  it('기본값과 다르게 바꾼 칸만 굵게 표시한다', async () => {
    render(
      <AppProviders>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </AppProviders>,
    )
    const unit = await screen.findByLabelText('케어트릿 120g inboundUnit')
    const lead = screen.getByLabelText('케어트릿 120g leadTime')
    expect(unit.parentElement).toHaveAttribute('data-changed', 'true')
    expect(lead.parentElement).toHaveAttribute('data-changed', 'false')
  })
})

describe('SettingsPage 단종 상품', () => {
  it('꺼 둔 상품은 조건 칸이 잠기고, 다시 켜면 풀린다', async () => {
    const user = userEvent.setup()
    render(
      <AppProviders>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </AppProviders>,
    )
    // 처음부터 꺼져 있는 상품
    expect(
      await screen.findByLabelText('단종 간식 30g leadTime'),
    ).toHaveAttribute('readonly')
    expect(screen.getByLabelText('단종 간식 30g cost')).toHaveAttribute(
      'readonly',
    )

    const lead = screen.getByLabelText('덴탈껌 S 10입 leadTime')
    expect(lead).not.toHaveAttribute('readonly')
    await user.click(screen.getByRole('switch', { name: '덴탈껌 S 10입 사용' }))
    await waitFor(() => expect(lead).toHaveAttribute('readonly'))

    await user.click(screen.getByRole('switch', { name: '덴탈껌 S 10입 사용' }))
    await waitFor(() => expect(lead).not.toHaveAttribute('readonly'))
  })
})
