import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  checkEmailAvailability,
  confirmVerificationCode,
  getMe,
  login,
  sendVerificationCode,
  signUp,
} from '../api/authApi'
import { MOCK_VERIFICATION_CODE } from './handlers'

const newEmail = 'new@b.com'
const password = 'Abcd123!'

const signUpBody = {
  companyName: '다음스낵',
  businessRegNo: null,
  managerName: '김담당',
  email: newEmail,
  password,
}

async function verify(email = newEmail) {
  await sendVerificationCode(email)
  const { verificationToken } = await confirmVerificationCode({
    email,
    code: MOCK_VERIFICATION_CODE,
  })
  return verificationToken
}

afterEach(() => {
  vi.useRealTimers()
})

// 오류 code 이름은 ipgo-server 기준입니다 (서버 README의 오류 표).
describe('auth MSW handler (서버 인증 API 규칙)', () => {
  it('A5: 가입한 이메일은 쓸 수 없고(대소문자 무시) 형식이 틀리면 INVALID_INPUT이다', async () => {
    expect(await checkEmailAvailability('SELLER@a.com')).toEqual({
      available: false,
    })
    expect(await checkEmailAvailability(newEmail)).toEqual({ available: true })
    await expect(checkEmailAvailability('not-email')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_INPUT',
    })
  })

  it('A6: 이미 가입한 이메일은 409, 60초 안에 다시 보내면 429, 60초 뒤에는 보낼 수 있다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })

    await expect(sendVerificationCode('seller@a.com')).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_EMAIL',
    })

    expect(await sendVerificationCode(newEmail)).toEqual({ expiresIn: 600 })
    await expect(sendVerificationCode(newEmail)).rejects.toMatchObject({
      status: 429,
      code: 'EMAIL_VERIFICATION_RATE_LIMITED',
    })

    vi.setSystemTime(Date.now() + 61_000)
    expect(await sendVerificationCode(newEmail)).toEqual({ expiresIn: 600 })
  })

  it('A7: 6자리 숫자가 아니면 INVALID_INPUT, 틀린 코드는 INVALID_EMAIL_CODE이다', async () => {
    await sendVerificationCode(newEmail)

    await expect(
      confirmVerificationCode({ email: newEmail, code: '12' }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' })
    await expect(
      confirmVerificationCode({ email: newEmail, code: '000000' }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_EMAIL_CODE' })
  })

  it('A7: 5번 틀리면 그 코드는 맞는 코드를 넣어도 무효이고, 다시 보내면 새 코드가 유효하다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await sendVerificationCode(newEmail)

    for (let count = 0; count < 5; count += 1) {
      await expect(
        confirmVerificationCode({ email: newEmail, code: '000000' }),
      ).rejects.toMatchObject({ code: 'INVALID_EMAIL_CODE' })
    }
    await expect(
      confirmVerificationCode({
        email: newEmail,
        code: MOCK_VERIFICATION_CODE,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EMAIL_CODE' })

    vi.setSystemTime(Date.now() + 61_000)
    await sendVerificationCode(newEmail)
    expect(
      await confirmVerificationCode({
        email: newEmail,
        code: MOCK_VERIFICATION_CODE,
      }),
    ).toHaveProperty('verificationToken')
  })

  it('A7: 10분이 지나면 EMAIL_CODE_EXPIRED이다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await sendVerificationCode(newEmail)

    vi.setSystemTime(Date.now() + 601_000)

    await expect(
      confirmVerificationCode({
        email: newEmail,
        code: MOCK_VERIFICATION_CODE,
      }),
    ).rejects.toMatchObject({ status: 400, code: 'EMAIL_CODE_EXPIRED' })
  })

  it('A1: 가입 토큰이 비어 있으면 INVALID_INPUT, 틀리면 INVALID_VERIFICATION_TOKEN이다', async () => {
    await expect(
      signUp({ ...signUpBody, verificationToken: '' }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' })
    await expect(
      signUp({ ...signUpBody, verificationToken: 'x'.repeat(43) }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_VERIFICATION_TOKEN' })
  })

  it('A1: 비밀번호는 8~10자, 영문 대·소문자·숫자·특수문자를 모두 넣어야 한다 (서버 규칙)', async () => {
    const verificationToken = await verify()

    for (const weak of [
      'Ab1!',
      'Abcd1234!xy',
      'abcd123!',
      'ABCD123!',
      'Abcdefg!',
      'Abcd1234',
      'Abc 123!',
      'Abc한123!',
    ]) {
      await expect(
        signUp({ ...signUpBody, password: weak, verificationToken }),
      ).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' })
    }
    expect(await signUp({ ...signUpBody, verificationToken })).toMatchObject({
      email: newEmail,
    })
  })

  it('A1: 새로 인증 코드를 보내면 이전 가입 토큰은 무효가 된다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const oldToken = await verify()

    vi.setSystemTime(Date.now() + 61_000)
    await sendVerificationCode(newEmail)

    await expect(
      signUp({ ...signUpBody, verificationToken: oldToken }),
    ).rejects.toMatchObject({ code: 'INVALID_VERIFICATION_TOKEN' })
  })

  it('A1~A7: 인증하고 가입한 계정으로 로그인하면 A4가 담당자 이름과 회사명을 돌려준다', async () => {
    const verificationToken = await verify()

    expect(await signUp({ ...signUpBody, verificationToken })).toMatchObject({
      email: newEmail,
      managerName: '김담당',
      companyName: '다음스낵',
    })
    // 토큰은 한 번만 쓸 수 있습니다.
    await expect(
      signUp({ ...signUpBody, verificationToken }),
    ).rejects.toMatchObject({ code: 'INVALID_VERIFICATION_TOKEN' })

    expect(await getMe()).toBeNull()
    await login({ email: newEmail, password })
    expect(await getMe()).toMatchObject({
      managerName: '김담당',
      companyName: '다음스낵',
    })
  })

  it('변경 요청은 CSRF 토큰이 없으면 403이고, /auth/csrf에서 받은 토큰이면 통과한다', async () => {
    const withoutToken = await fetch('/api/auth/logout', { method: 'POST' })
    expect(withoutToken.status).toBe(403)
    expect(await withoutToken.json()).toMatchObject({ code: 'FORBIDDEN' })

    const { headerName, token } = await (await fetch('/api/auth/csrf')).json()
    const withToken = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { [headerName]: token },
    })
    expect(withToken.status).toBe(204)
  })

  it('로그인하면 CSRF 토큰이 새로 바뀌어서 예전 토큰은 거절된다', async () => {
    const before = await (await fetch('/api/auth/csrf')).json()
    await login({ email: 'seller@a.com', password: 'pass1234' })
    const after = await (await fetch('/api/auth/csrf')).json()

    expect(after.token).not.toBe(before.token)
    const stale = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { [before.headerName]: before.token },
    })
    expect(stale.status).toBe(403)
  })

  it('로그인 실패는 INVALID_CREDENTIALS, 로그인 전 내 정보는 null이다', async () => {
    await expect(
      login({ email: 'seller@a.com', password: 'wrong' }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' })
    expect(await getMe()).toBeNull()
  })
})
