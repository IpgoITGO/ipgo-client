import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../../mocks/server'
import { findId } from '../api/authApi'
import { FindAccountModal } from './FindAccountModal'

function setup() {
  const onDone = vi.fn()
  const onClose = vi.fn()
  render(<FindAccountModal onClose={onClose} onDone={onDone} />)
  return { onDone, onClose, user: userEvent.setup() }
}

describe('FindAccountModal', () => {
  it('비밀번호를 찾아 바꾸고 로그인 화면으로 돌아간다', async () => {
    const { user, onDone } = setup()

    await user.click(screen.getByRole('tab', { name: '비밀번호 찾기' }))
    await user.type(screen.getByLabelText('이메일'), 'seller@a.com')
    await user.click(screen.getByRole('button', { name: '코드 보내기' }))

    await user.type(await screen.findByLabelText('인증 코드'), '000000')
    await user.click(screen.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('코드가 맞지 않아요.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('인증 코드'))
    await user.type(screen.getByLabelText('인증 코드'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))

    await user.type(await screen.findByLabelText('새 비밀번호'), 'Abcd1234!')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'Abcd1234!')
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }))

    expect(await screen.findByText('비밀번호를 바꿨어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '로그인하기' }))
    expect(onDone).toHaveBeenCalledWith('seller@a.com')
  })

  it('비밀번호가 서로 다르면 칸 아래에 알려 준다', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('tab', { name: '비밀번호 찾기' }))
    await user.type(screen.getByLabelText('이메일'), 'seller@a.com')
    await user.click(screen.getByRole('button', { name: '코드 보내기' }))
    await user.type(await screen.findByLabelText('인증 코드'), '123456')
    await user.click(screen.getByRole('button', { name: '확인' }))
    await user.type(await screen.findByLabelText('새 비밀번호'), 'Abcd1234!')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'Abcd1234?')
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }))

    expect(await screen.findByText('비밀번호가 서로 달라요.')).toBeVisible()
  })

  it('사업자등록번호와 담당자 이름으로 가린 이메일을 찾는다', async () => {
    const { user, onDone } = setup()
    const requests: unknown[] = []
    server.events.on('request:start', async ({ request }) => {
      if (new URL(request.url).pathname === '/api/auth/find-id')
        requests.push(await request.clone().json())
    })

    await user.type(screen.getByLabelText('사업자등록번호'), '1234567891')
    expect(screen.getByLabelText('사업자등록번호')).toHaveValue('123-45-67891')
    // 서버처럼 띄어쓰기는 무시한다
    await user.type(screen.getByLabelText('담당자 이름'), '박 셀러')
    await user.click(screen.getByRole('button', { name: '아이디 찾기' }))

    expect(await screen.findByText('se***@a.com 이에요')).toBeInTheDocument()
    expect(requests).toEqual([
      { businessRegNo: '1234567891', managerName: '박 셀러' },
    ])
    await user.click(screen.getByRole('button', { name: '이 이메일로 로그인' }))
    expect(onDone).toHaveBeenCalledWith()
  })

  it('담당자 이름이 비면 보내지 않고 칸에 알려 준다', async () => {
    const { user } = setup()

    await user.type(screen.getByLabelText('사업자등록번호'), '1234567891')
    await user.click(screen.getByRole('button', { name: '아이디 찾기' }))

    expect(
      await screen.findByText('담당자 이름을 입력해 주세요.'),
    ).toBeInTheDocument()
  })

  it('번호와 이름이 맞는 계정이 없으면 알려 준다', async () => {
    const { user } = setup()

    await user.type(screen.getByLabelText('사업자등록번호'), '1234567891')
    await user.type(screen.getByLabelText('담당자 이름'), '김셀러')
    await user.click(screen.getByRole('button', { name: '아이디 찾기' }))

    expect(
      await screen.findByText(
        '사업자등록번호와 담당자 이름이 맞는 계정이 없어요.',
      ),
    ).toBeInTheDocument()
  })

  it('번호가 없는 기존 계정은 직접 선택한 회사명 방식으로만 찾는다', async () => {
    const { user } = setup()
    const requests: unknown[] = []
    server.events.on('request:start', async ({ request }) => {
      if (new URL(request.url).pathname === '/api/auth/find-id')
        requests.push(await request.clone().json())
    })
    await user.type(screen.getByLabelText('사업자등록번호'), '1234567891')
    await user.type(screen.getByLabelText('담당자 이름'), '이기존')
    await user.click(screen.getByRole('button', { name: '아이디 찾기' }))
    expect(
      await screen.findByText(
        '사업자등록번호와 담당자 이름이 맞는 계정이 없어요.',
      ),
    ).toBeVisible()
    expect(requests).toEqual([
      { businessRegNo: '1234567891', managerName: '이기존' },
    ])
    expect(screen.queryByLabelText('회사명')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: '사업자번호 없이 가입한 계정 찾기' }),
    )
    expect(screen.queryByText(/맞는 계정이 없어요/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('회사명'), '㈜ 옛 입고')
    await user.click(screen.getByRole('button', { name: '아이디 찾기' }))
    expect(await screen.findByText('le***@a.test 이에요')).toBeVisible()
    expect(requests).toEqual([
      { businessRegNo: '1234567891', managerName: '이기존' },
      { companyName: '㈜ 옛 입고', managerName: '이기존' },
    ])
    expect(screen.queryByText('legacy@a.test')).not.toBeInTheDocument()
  })

  it('기존 계정 찾기도 회사명과 담당자 이름이 모두 있어야 요청한다', async () => {
    const { user } = setup()
    const request = vi.fn()
    server.use(http.post('/api/auth/find-id', request))
    await user.click(
      screen.getByRole('button', { name: '사업자번호 없이 가입한 계정 찾기' }),
    )
    await user.click(screen.getByRole('button', { name: '아이디 찾기' }))
    expect(await screen.findByText('회사명을 입력해 주세요.')).toBeVisible()
    expect(screen.getByText('담당자 이름을 입력해 주세요.')).toBeVisible()
    expect(request).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: '사업자등록번호로 찾기' }),
    )
    expect(screen.getByLabelText('사업자등록번호')).toBeVisible()
    expect(
      screen.queryByText('회사명을 입력해 주세요.'),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['businessRegNo', '숫자 10자리로 입력해 주세요.', false],
    ['managerName', '담당자 이름을 확인해 주세요.', false],
    ['companyName', '가입할 때 적은 회사명을 확인해 주세요.', true],
  ] as const)(
    '서버 400의 %s 오류를 해당 칸에 표시한다',
    async (field, message, legacy) => {
      const { user } = setup()
      server.use(
        http.post('/api/auth/find-id', () =>
          HttpResponse.json(
            { code: 'INVALID_INPUT', message: '입력 오류', details: { field } },
            { status: 400 },
          ),
        ),
      )
      if (legacy) {
        await user.click(
          screen.getByRole('button', {
            name: '사업자번호 없이 가입한 계정 찾기',
          }),
        )
        await user.type(screen.getByLabelText('회사명'), '(주)')
      } else {
        await user.type(screen.getByLabelText('사업자등록번호'), '1234567891')
      }
      await user.type(screen.getByLabelText('담당자 이름'), '박셀러')
      await user.click(screen.getByRole('button', { name: '아이디 찾기' }))
      expect(await screen.findByText(message)).toBeVisible()
    },
  )

  it('기존 계정 찾기에서도 불일치를 안내한다', async () => {
    const { user } = setup()
    await user.click(
      screen.getByRole('button', { name: '사업자번호 없이 가입한 계정 찾기' }),
    )
    await user.type(screen.getByLabelText('회사명'), '없는 회사')
    await user.type(screen.getByLabelText('담당자 이름'), '이기존')
    await user.click(screen.getByRole('button', { name: '아이디 찾기' }))
    expect(
      await screen.findByText('회사명과 담당자 이름이 맞는 계정이 없어요.'),
    ).toBeVisible()
  })

  it('복수의 가린 이메일을 서버 목록 그대로 표시한다', async () => {
    const { user } = setup()
    server.use(
      http.post('/api/auth/find-id', () =>
        HttpResponse.json({
          maskedEmails: ['ne***@a.test', 'ol***@b.test'],
          maskedEmail: 'ne***@a.test',
        }),
      ),
    )
    await user.type(screen.getByLabelText('사업자등록번호'), '1234567891')
    await user.type(screen.getByLabelText('담당자 이름'), '박셀러')
    await user.click(screen.getByRole('button', { name: '아이디 찾기' }))
    expect(await screen.findByText('가입한 이메일이 2개 있어요')).toBeVisible()
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['ne***@a.test', 'ol***@b.test'])
  })

  it('회사명 mock도 담당자 일치와 유효한 회사명을 요구한다', async () => {
    await expect(
      findId({ companyName: '㈜ 옛입고', managerName: '다른 사람' }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
    await expect(
      findId({ companyName: '(주)', managerName: '이기존' }),
    ).rejects.toMatchObject({
      status: 400,
      details: { field: 'companyName' },
    })
  })

  it('Esc로 닫힌다', async () => {
    const { user, onClose } = setup()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
