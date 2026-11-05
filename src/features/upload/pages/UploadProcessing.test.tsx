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
function renderProcessing(props: {
  done?: boolean
  onGoDashboard?: () => void
}) {
  const routes: RouteObject[] = [
    {
      path: '/wait',
      element: (
        <UploadProcessing
          done={props.done}
          onGoDashboard={props.onGoDashboard ?? vi.fn()}
        />
      ),
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

  it('2분이 넘으면 닫아도 처리가 계속된다는 안내와 대시보드 버튼을 보여주고, 그 버튼은 묻지 않고 나간다', () => {
    const onGoDashboard = vi.fn()
    const { router } = renderProcessing({ onGoDashboard })

    act(() => {
      vi.advanceTimersByTime((LONG_WAIT_SECONDS + 14) * 1000)
    })

    expect(screen.getByText('생각보다 오래 걸려요')).toBeInTheDocument()
    expect(
      screen.getByText('창을 닫아도 계속 확인해요 · 끝나면 대시보드에 떠요'),
    ).toBeInTheDocument()
    // 지난 시간은 화면에만 보이고 화면 읽기에서는 뺀다
    expect(screen.getByText('2분 14초째')).toHaveAttribute(
      'aria-hidden',
      'true',
    )

    // 버튼이 하는 일(onGoDashboard)이 실제 이동이면 확인 팝업 없이 나가야 한다
    onGoDashboard.mockImplementation(() => {
      void router.navigate('/dashboard')
    })
    fireEvent.click(screen.getByRole('button', { name: '대시보드로' }))
    expect(onGoDashboard).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
  })

  it('끝나면 같은 장면에서 마침 문구로 바뀌고 안내 띠는 사라진다', () => {
    function Host() {
      const [done, setDone] = useState(false)
      return (
        <>
          <UploadProcessing done={done} onGoDashboard={vi.fn()} />
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
})
