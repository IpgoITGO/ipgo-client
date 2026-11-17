import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LONG_WAIT_SECONDS, UploadProcessing } from './UploadProcessing'

// useBlocker는 데이터 라우터에서만 동작한다. 처리 화면(/wait)과 나갈 곳(/dashboard)만 둔다.
function renderProcessing(props: { done?: boolean }) {
  const routes: RouteObject[] = [
    {
      path: '/wait',
      element: <UploadProcessing done={props.done} />,
    },
    { path: '/dashboard', element: <p>대시보드 화면</p> },
  ]
  const router = createMemoryRouter(routes, { initialEntries: ['/wait'] })
  return { router, ...render(<RouterProvider router={router} />) }
}

describe('UploadProcessing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('2분이 넘기 전에는 오래 걸림 안내를 보여주지 않는다', () => {
    renderProcessing({})

    expect(screen.getByText('수불부를 확인하고 있어요')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime((LONG_WAIT_SECONDS - 1) * 1000)
    })

    expect(screen.queryByText('생각보다 오래 걸려요')).not.toBeInTheDocument()
  })

  it('2분이 넘으면 닫아도 처리가 계속된다는 안내 한 줄을 보여주고 버튼은 두지 않는다', () => {
    renderProcessing({})

    act(() => {
      vi.advanceTimersByTime((LONG_WAIT_SECONDS + 14) * 1000)
    })

    expect(screen.getByText('생각보다 오래 걸려요')).toBeInTheDocument()
    expect(
      screen.getByText(/창을 닫아도 계속 확인해요 · 끝나면 대시보드에 떠요/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/\d+분.*초째/)).not.toBeInTheDocument()

    expect(
      screen.queryByRole('button', { name: '대시보드로' }),
    ).not.toBeInTheDocument()
  })

  it('끝나면 같은 장면에서 마침 문구로 바뀌고 안내 띠는 사라진다', () => {
    function Host() {
      const [done, setDone] = useState(false)
      return (
        <>
          <UploadProcessing done={done} />
          <button onClick={() => setDone(true)} type="button">
            처리 끝남
          </button>
        </>
      )
    }
    render(
      <RouterProvider
        router={createMemoryRouter([{ path: '/', element: <Host /> }])}
      />,
    )
    act(() => {
      vi.advanceTimersByTime((LONG_WAIT_SECONDS + 1) * 1000)
    })
    expect(screen.getByText('생각보다 오래 걸려요')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '처리 끝남' }))

    expect(screen.getByText('수불부 확인을 마쳤어요')).toBeInTheDocument()
    expect(screen.queryByText('생각보다 오래 걸려요')).not.toBeInTheDocument()
  })

  it('처리 중에 뒤로 가려 하면 확인을 묻고, 계속 기다리면 그대로 있다', () => {
    const { router } = renderProcessing({})

    act(() => {
      void router.navigate('/dashboard')
    })

    expect(
      screen.getByRole('dialog', { name: '수불부를 확인하는 중이에요' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/지금 나가도 괜찮아요/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '계속 기다리기' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/wait')
  })

  it('나가기를 누르면 그때서야 나간다', () => {
    const { router } = renderProcessing({})

    act(() => {
      void router.navigate('/dashboard')
    })
    fireEvent.click(screen.getByRole('button', { name: '나가기' }))

    expect(router.state.location.pathname).toBe('/dashboard')
  })

  it('끝난 장면에서는 나가려 해도 묻지 않는다', () => {
    const { router } = renderProcessing({ done: true })

    act(() => {
      void router.navigate('/dashboard')
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
  })

  it('파일 줄: 이름은 올린 그대로, 달은 알 때만 붙이고 여러 개면 몇 개째인지 센다', () => {
    const { container } = render(
      <RouterProvider
        router={createMemoryRouter([
          {
            path: '/',
            element: (
              <UploadProcessing
                files={[
                  {
                    id: '1',
                    name: '수불부_2025-09.xlsx',
                    month: '2025년 9월',
                    state: 'done',
                  },
                  { id: '2', name: '9월 재고(최종).xlsx', state: 'now' },
                  { id: '3', name: 'export (3).csv', state: 'wait' },
                ]}
              />
            ),
          },
        ])}
      />,
    )
    const rows = [...container.querySelectorAll('ol li')].map(
      (row) => row.textContent,
    )
    expect(rows).toEqual([
      '2025년 9월수불부_2025-09.xlsx확인 끝',
      '9월 재고(최종).xlsx확인 중',
      'export (3).csv기다림',
    ])
    expect(screen.getByText('/ 3개 확인')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: '수불부 확인 진행률' }),
    ).toHaveValue(1)
  })
})
