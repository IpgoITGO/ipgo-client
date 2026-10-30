import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { resetAuthMock } from '../auth/mocks/handlers'
import { resetCsrfToken, setAccessToken } from '../shared/api/client'
import { server } from '../mocks/server'

// 느린 컴퓨터·CI에서 기본 1초 대기가 모자라 테스트가 흔들리지 않게 늘립니다.
configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 15_000 })

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetAuthMock()
  resetCsrfToken()
  setAccessToken(null)
})
afterAll(() => server.close())
