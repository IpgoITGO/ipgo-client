import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, ApiError } from '../../shared/api/client'
import { NotificationSettings } from './NotificationSettings'
import {
  browserConnected,
  connectBrowser,
  disconnectBrowser,
  getNotificationSettings,
  pushSupported,
  saveNotificationSettings,
} from './pushApi'

vi.mock('../../shared/api/client', async (original) => ({
  ...(await original<object>()),
  apiRequest: vi.fn(),
}))
vi.mock('./pushApi', () => ({
  browserConnected: vi.fn(),
  connectBrowser: vi.fn(),
  disconnectBrowser: vi.fn(),
  getNotificationSettings: vi.fn(),
  pushSupported: vi.fn(),
  saveNotificationSettings: vi.fn(),
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getNotificationSettings).mockResolvedValue({
    enabled: false,
    sendHour: 9,
    timeZone: 'Asia/Seoul',
  })
  vi.mocked(apiRequest).mockResolvedValue({ publicKey: 'test-only' })
  vi.mocked(browserConnected).mockResolvedValue(false)
  vi.mocked(pushSupported).mockReturnValue(true)
  vi.mocked(connectBrowser).mockResolvedValue(undefined)
  vi.mocked(disconnectBrowser).mockResolvedValue(undefined)
  vi.mocked(saveNotificationSettings).mockImplementation(async (patch) => ({
    enabled: false,
    sendHour: 9,
    timeZone: 'Asia/Seoul',
    ...patch,
  }))
})
function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <NotificationSettings />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}
describe('발주 필요 알림 설정', () => {
  it('사용자가 켜기를 누른 뒤에만 브라우저 권한과 수신 설정을 켠다', async () => {
    const user = open()
    await screen.findByText(
      'Asia/Seoul 기준 · 정시부터 1시간 안에 발송하며 대상이 없으면 보내지 않아요.',
    )
    expect(connectBrowser).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: '알림 켜고 이 브라우저 연결' }),
    )
    await screen.findByText('알림 설정을 저장했어요.')
    expect(connectBrowser).toHaveBeenCalledWith(true)
    expect(saveNotificationSettings).toHaveBeenCalledWith({ enabled: true })
  })
  it('권한 거절은 수신 동의로 저장하지 않는다', async () => {
    vi.mocked(connectBrowser).mockRejectedValueOnce(
      new Error('알림 권한을 허용해 주세요.'),
    )
    const user = open()
    await screen.findByText(/Asia\/Seoul 기준/)
    await user.click(
      screen.getByRole('button', { name: '알림 켜고 이 브라우저 연결' }),
    )
    await screen.findByText('알림 권한을 허용해 주세요.')
    expect(saveNotificationSettings).not.toHaveBeenCalled()
  })
  it('끄면 모든 기기 수신 설정부터 끄고 현재 브라우저도 해제한다', async () => {
    vi.mocked(getNotificationSettings).mockResolvedValueOnce({
      enabled: true,
      sendHour: 9,
      timeZone: 'Asia/Seoul',
    })
    const user = open()
    await screen.findByText(/Asia\/Seoul 기준/)
    await user.click(screen.getByRole('button', { name: '알림 끄기' }))
    await screen.findByText('모든 기기의 하루 1회 알림을 껐어요.')
    expect(saveNotificationSettings).toHaveBeenCalledWith({ enabled: false })
    expect(disconnectBrowser).toHaveBeenCalledOnce()
  })
  it('정시 선택은 서버에 시간만 변경한다', async () => {
    const user = open()
    await screen.findByText(/Asia\/Seoul 기준/)
    await waitFor(() =>
      expect(screen.getByLabelText('알림 받을 시각')).toBeEnabled(),
    )
    await user.selectOptions(screen.getByLabelText('알림 받을 시각'), '15')
    await waitFor(() =>
      expect(saveNotificationSettings).toHaveBeenCalledWith({ sendHour: 15 }),
    )
    expect(saveNotificationSettings).toHaveBeenCalledWith({ sendHour: 15 })
    expect(connectBrowser).not.toHaveBeenCalled()
  })
  it('서버에 공개키가 없으면 준비 중으로 안내하고 연결을 막는다', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(
      new ApiError(503, 'PUSH_UNAVAILABLE', '준비 중'),
    )
    open()
    await screen.findByText('알림 서비스를 준비 중이에요.')
    expect(
      screen.getByRole('button', { name: '알림 켜고 이 브라우저 연결' }),
    ).toBeDisabled()
  })

  it('지원하지 않는 환경에서는 연결을 막는다', async () => {
    vi.mocked(pushSupported).mockReturnValue(false)
    open()
    await screen.findByText(/실제 사이트의 HTTPS PC 브라우저/)
    expect(
      screen.getByRole('button', { name: '알림 켜고 이 브라우저 연결' }),
    ).toBeDisabled()
  })
})
