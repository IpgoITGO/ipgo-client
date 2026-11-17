import { render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppProviders } from '../../app/providers/AppProviders'
import { routes } from '../../app/router/router'
import { server } from '../../mocks/server'
import { MOCK_VERIFICATION_CODE } from '../mocks/handlers'

vi.mock('../../features/legal/model/signupPolicy', async () => ({
  signupPolicy: (
    await import('../../features/legal/model/fixtures/signup-policy.json')
  ).default,
}))

async function passwordStep(user: UserEvent) {
  const router = createMemoryRouter(routes, { initialEntries: ['/signup'] })
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  await user.type(await screen.findByLabelText('회사명 (상호)'), '합성 회사')
  await user.type(screen.getByLabelText('사업자등록번호'), '1234567891')
  await user.type(screen.getByLabelText('담당자 이름'), '합성 담당')
  await user.click(screen.getByRole('button', { name: '다음' }))
  await user.type(
    await screen.findByLabelText('이메일'),
    'consent@example.test',
  )
  await user.click(screen.getByRole('button', { name: '중복 확인' }))
  await user.click(
    await screen.findByRole('button', { name: '인증 코드 받기' }),
  )
  await user.type(
    await screen.findByLabelText('인증 코드'),
    MOCK_VERIFICATION_CODE,
  )
  await user.click(screen.getByRole('button', { name: '확인' }))
  await screen.findByText('인증을 마쳤어요.')
  await user.click(screen.getByRole('button', { name: '다음' }))
  await user.type(await screen.findByLabelText('비밀번호'), 'Abcd123!')
  await user.type(screen.getByLabelText('비밀번호 확인'), 'Abcd123!')
  return router
}

describe('확정 문서가 있는 가입 동의', () => {
  it('필수 두 동의와 전문 보기, 전체 동의 해제 후 정확한 버전을 전송한다', async () => {
    let submitted: Record<string, unknown> | undefined
    server.use(
      http.post('/api/auth/signup', async ({ request }) => {
        submitted = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(
          {
            userId: 12,
            email: 'consent@example.test',
            companyName: '합성 회사',
            managerName: '합성 담당',
          },
          { status: 201 },
        )
      }),
    )
    const user = userEvent.setup()
    await passwordStep(user)
    const submit = screen.getByRole('button', { name: '가입하기' })
    expect(submit).toBeDisabled()
    await user.click(
      screen.getByRole('checkbox', { name: '이용약관 동의 (필수)' }),
    )
    expect(submit).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: '수집·이용 동의서 전문 보기' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: '개인정보 수집·이용 동의서',
    })
    expect(
      within(dialog).getByText(/수집 항목·목적·보유 기간·동의 거부/),
    ).toBeVisible()
    expect(
      within(dialog).getByRole('link', { name: '개인정보 처리방침 전체 보기' }),
    ).toHaveAttribute('target', '_blank')
    await user.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(screen.getByLabelText('비밀번호')).toHaveValue('Abcd123!')
    await user.click(screen.getByRole('checkbox', { name: '전체 동의' }))
    expect(submit).toBeEnabled()
    await user.click(
      screen.getByRole('checkbox', { name: '개인정보 수집·이용 동의 (필수)' }),
    )
    expect(submit).toBeDisabled()
    expect(
      screen.getByRole('checkbox', { name: '전체 동의' }),
    ).not.toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: '전체 동의' }))
    await user.click(submit)
    await screen.findByRole('heading', { name: '로그인' })
    expect(submitted).toMatchObject({
      agreements: { terms: true, privacy: true, version: 'fixture-signup-v1' },
    })
  })

  it('서버가 동의 버전을 거절하면 입력을 보존하고 재확인을 안내한다', async () => {
    server.use(
      http.post('/api/auth/signup', () =>
        HttpResponse.json(
          {
            code: 'INVALID_INPUT',
            details: { field: 'agreements' },
            message: '약관이 바뀌었어요.',
          },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    await passwordStep(user)
    await user.click(screen.getByRole('checkbox', { name: '전체 동의' }))
    await user.click(screen.getByRole('button', { name: '가입하기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '새로고침한 뒤 약관을 다시 확인',
    )
    expect(screen.getByLabelText('비밀번호')).toHaveValue('Abcd123!')
    expect(
      screen.getByRole('checkbox', { name: '전체 동의' }),
    ).not.toBeChecked()
    expect(screen.getByRole('button', { name: '가입하기' })).toBeDisabled()
  })
})
