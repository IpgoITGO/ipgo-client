import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type PropsWithChildren } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppProviders } from '../app/providers/AppProviders'
import { login } from '../auth/api/authApi'
import { useAuth } from '../auth/model/useAuth'
import { DashboardPage } from '../features/dashboard/pages/DashboardPage'
import { SettingsPage } from '../features/settings/pages/SettingsPage'

function AuthReady({ children }: PropsWithChildren) {
  return useAuth().status === 'loading' ? null : children
}

function Address() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output aria-label="검색 주소">{location.search}</output>
      <button onClick={() => navigate('?q=외부검색&size=20')}>다른 주소</button>
      <button onClick={() => navigate(-1)}>뒤로</button>
    </>
  )
}

beforeEach(async () => {
  await login({ email: 'seller@a.com', password: 'pass1234' })
})

describe.each([
  { path: '/dashboard', label: '목록에서 상품 찾기', Page: DashboardPage },
  { path: '/settings', label: '상품명 또는 바코드 검색', Page: SettingsPage },
])('$path 한글 검색', ({ path, label, Page }) => {
  it.each(['실리콘', '멍멍펀치'])(
    '%s 조합 중 URL을 유지하고 완료 후 검색·주소 이동·지우기를 반영한다',
    async (word) => {
      const user = userEvent.setup()
      const view = render(
        <AppProviders>
          <AuthReady>
            <MemoryRouter initialEntries={[`${path}?q=기존&page=2&size=20`]}>
              <Page />
              <Address />
            </MemoryRouter>
          </AuthReady>
        </AppProviders>,
      )
      const input = await screen.findByRole('searchbox', { name: label })
      const address = () =>
        new URLSearchParams(
          screen.getByLabelText('검색 주소').textContent ?? '',
        )
      expect(input).toHaveValue('기존')
      fireEvent.compositionStart(input)
      for (const text of ['ㅅ', '시', word]) {
        fireEvent.change(input, { target: { value: text } })
        expect(input).toHaveValue(text)
        expect(address().get('q')).toBe('기존')
        expect(address().get('page')).toBe('2')
      }
      fireEvent.compositionEnd(input, { data: word, target: { value: word } })
      await waitFor(() => expect(address().get('q')).toBe(word))
      expect(input).toHaveValue(word)
      expect(address().has('page')).toBe(false)
      expect(address().get('size')).toBe('20')
      await user.click(screen.getByRole('button', { name: '다른 주소' }))
      expect(input).toHaveValue('외부검색')
      await user.click(screen.getByRole('button', { name: '뒤로' }))
      expect(input).toHaveValue(word)
      await user.clear(input)
      expect(input).toHaveValue('')
      expect(address().has('q')).toBe(false)
      view.unmount()
    },
  )
})
