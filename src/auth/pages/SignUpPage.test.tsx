import { render, screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppProviders } from '../../app/providers/AppProviders'
import { routes } from '../../app/router/router'
import { server } from '../../mocks/server'
import { MOCK_VERIFICATION_CODE } from '../mocks/handlers'

const newEmail = 'new@b.com'

function renderSignUp() {
  const router = createMemoryRouter(routes, { initialEntries: ['/signup'] })

  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

async function fillCompany(user: UserEvent) {
  await user.type(await screen.findByLabelText('회사명 (상호)'), '다음스낵')
  await user.type(screen.getByLabelText('담당자 이름'), '김담당')
}

async function fillPassword(user: UserEvent, password = 'abcd1234!') {
  await user.type(screen.getByLabelText('비밀번호'), password)
  await user.type(screen.getByLabelText('비밀번호 확인'), password)
}

async function sendCode(user: UserEvent, email = newEmail) {
  await user.type(await screen.findByLabelText('이메일'), email)
  await user.click(screen.getByRole('button', { name: '중복 확인' }))
}

async function verifyEmail(user: UserEvent) {
  await sendCode(user)
  await user.type(
    await screen.findByLabelText('인증 코드'),
    MOCK_VERIFICATION_CODE,
  )
  await user.click(screen.getByRole('button', { name: '확인' }))
  await screen.findByText('인증을 마쳤어요.')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SignUpPage', () => {
  it('틀린 코드나 시간 초과 뒤에도 다시 보내기를 눌러 새 타이머를 시작할 수 있다', async () => {
    const user = userEvent.setup()
    renderSignUp()

    await sendCode(user)
    await user.type(await screen.findByLabelText('인증 코드'), '000000')
    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText(/코드가 맞지 않아요/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^다시 보내기/ }),
    ).toBeInTheDocument()

    // 10분이 지난 것으로 시계를 앞당깁니다. 타이머가 1초마다 새로 그립니다.
    const realNow = Date.now.bind(Date)
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 601_000)

    expect(
      await screen.findByText('시간이 지났어요. 코드를 다시 받아 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '확인' })).toBeDisabled()
    const resend = screen.getByRole('button', { name: '다시 보내기' })
    expect(resend).toBeEnabled()

    await user.click(resend)

    await waitFor(() =>
      expect(
        screen.queryByText('시간이 지났어요. 코드를 다시 받아 주세요.'),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByLabelText('남은 시간')).toHaveTextContent(
      /^(10:00|09:59)$/,
    )
  })

  it('중복 확인을 통과하면 코드를 보내고 10분 타이머와 다시 보내기 대기 시간을 보여준다', async () => {
    const user = userEvent.setup()
    renderSignUp()

    await sendCode(user)

    expect(
      await screen.findByText('사용할 수 있는 이메일이에요.'),
    ).toBeInTheDocument()
    expect(await screen.findByLabelText('인증 코드')).toBeInTheDocument()
    expect(screen.getByLabelText('남은 시간')).toHaveTextContent(
      /^(10:00|09:59)$/,
    )
    expect(screen.getByRole('button', { name: /^다시 보내기/ })).toBeDisabled()
  })

  it('이미 가입한 이메일이면 안내하고 코드 입력 칸을 열지 않는다', async () => {
    const user = userEvent.setup()
    renderSignUp()

    await sendCode(user, 'seller@a.com')

    expect(
      await screen.findByText('이미 가입한 이메일이에요.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('인증 코드')).not.toBeInTheDocument()
  })

  it('틀린 코드는 안내하고 맞는 코드는 인증을 마친다', async () => {
    const user = userEvent.setup()
    renderSignUp()

    await sendCode(user)
    await user.type(await screen.findByLabelText('인증 코드'), '000000')
    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText(/코드가 맞지 않아요/)).toBeInTheDocument()

    await user.clear(screen.getByLabelText('인증 코드'))
    await user.type(screen.getByLabelText('인증 코드'), MOCK_VERIFICATION_CODE)
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(await screen.findByText('인증을 마쳤어요.')).toBeInTheDocument()
    expect(screen.queryByLabelText('인증 코드')).not.toBeInTheDocument()
  })

  it('이메일을 고치면 인증을 처음부터 다시 해야 한다', async () => {
    const user = userEvent.setup()
    renderSignUp()

    await verifyEmail(user)
    await user.type(screen.getByLabelText('이메일'), 'x')

    expect(screen.queryByText('인증을 마쳤어요.')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '중복 확인' }),
    ).toBeInTheDocument()
  })

  it('이메일 인증 없이 가입하면 인증을 먼저 하라고 안내한다', async () => {
    const user = userEvent.setup()
    renderSignUp()

    await fillCompany(user)
    await user.type(screen.getByLabelText('이메일'), newEmail)
    await fillPassword(user)
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    expect(
      await screen.findByText('이메일 인증을 먼저 해 주세요.'),
    ).toBeInTheDocument()
  })

  it('잘못 입력한 칸마다 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderSignUp()

    await user.type(await screen.findByLabelText(/사업자등록번호/), '12345')
    await user.type(screen.getByLabelText('비밀번호'), 'abcdefgh')
    await user.type(screen.getByLabelText('비밀번호 확인'), 'abcdefgx')
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    expect(
      await screen.findByText('회사명을 입력해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('숫자 10자리로 입력해 주세요.')).toBeInTheDocument()
    expect(
      screen.getByText('8자 이상, 영문·숫자·특수문자를 섞어 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('비밀번호가 서로 달라요.')).toBeInTheDocument()
  })

  it('가입을 마치면 로그인 화면으로 가서 가입한 이메일로 로그인할 수 있다', async () => {
    const user = userEvent.setup()
    renderSignUp()

    await fillCompany(user)
    await user.type(screen.getByLabelText(/사업자등록번호/), '123-45-67890')
    await verifyEmail(user)
    await fillPassword(user)
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    expect(
      await screen.findByText('가입을 마쳤어요. 로그인해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toHaveValue(newEmail)

    await user.type(screen.getByLabelText('비밀번호'), 'abcd1234!')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(
      await screen.findByLabelText('김담당 · 다음스낵'),
    ).toBeInTheDocument()
  })

  it('서버가 가입을 거절하면 안내 문구를 보여준다', async () => {
    server.use(
      http.post('/api/auth/signup', () =>
        HttpResponse.json(
          {
            code: 'INVALID_INPUT',
            message: '입력한 내용을 다시 확인해 주세요.',
          },
          { status: 400 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderSignUp()

    await fillCompany(user)
    await verifyEmail(user)
    await fillPassword(user)
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '입력한 내용을 다시 확인해 주세요.',
    )
  })
})
