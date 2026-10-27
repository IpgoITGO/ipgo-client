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

const signUpBody = {
  companyName: '다음스낵',
  businessRegNo: null,
  managerName: '김담당',
  email: newEmail,
  password: 'abcd1234',
}

afterEach(() => {
  vi.useRealTimers()
})

describe('auth MSW handler (API 명세 A1~A7)', () => {
  it('A5: 가입한 이메일은 쓸 수 없고 형식이 틀리면 INVALID_INPUT이다', async () => {
    expect(await checkEmailAvailability('seller@a.com')).toEqual({
      available: false,
    })
    expect(await checkEmailAvailability(newEmail)).toEqual({ available: true })
    await expect(checkEmailAvailability('not-email')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_INPUT',
    })
  })

  it('A6: 이미 가입한 이메일은 409, 1분 안에 다시 보내면 429, 1분 뒤에는 보낼 수 있다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })

    await expect(sendVerificationCode('seller@a.com')).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_EXISTS',
    })

    expect(await sendVerificationCode(newEmail)).toEqual({ expiresIn: 600 })
    await expect(sendVerificationCode(newEmail)).rejects.toMatchObject({
      status: 429,
      code: 'TOO_MANY_REQUESTS',
    })

    vi.setSystemTime(Date.now() + 61_000)
    expect(await sendVerificationCode(newEmail)).toEqual({ expiresIn: 600 })
  })

  it('A7: 5번 틀리면 코드가 무효가 되고, 10분이 지나도 만료된다', async () => {
    await sendVerificationCode(newEmail)

    for (const remaining of [4, 3, 2, 1]) {
      await expect(
        confirmVerificationCode({ email: newEmail, code: '000000' }),
      ).rejects.toMatchObject({
        code: 'VERIFICATION_FAILED',
        message: expect.stringContaining(`${remaining}번 더`),
      })
    }
    await expect(
      confirmVerificationCode({ email: newEmail, code: '000000' }),
    ).rejects.toMatchObject({
      code: 'VERIFICATION_FAILED',
      message: expect.stringContaining('5번 틀려서'),
    })
    await expect(
      confirmVerificationCode({
        email: newEmail,
        code: MOCK_VERIFICATION_CODE,
      }),
    ).rejects.toMatchObject({ code: 'VERIFICATION_EXPIRED' })
  })

  it('A1: 인증 토큰 없이는 가입할 수 없다', async () => {
    await expect(
      signUp({ ...signUpBody, verificationToken: '' }),
    ).rejects.toMatchObject({ status: 400, code: 'VERIFICATION_REQUIRED' })
  })

  it('A1: 비밀번호 규칙을 어기면 INVALID_INPUT이고 details.field가 password이다', async () => {
    await sendVerificationCode(newEmail)
    const { verificationToken } = await confirmVerificationCode({
      email: newEmail,
      code: MOCK_VERIFICATION_CODE,
    })

    await expect(
      signUp({ ...signUpBody, password: 'onlyletters', verificationToken }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' })
  })

  it('A1~A7: 인증하고 가입한 계정으로 로그인하면 A4가 담당자 이름과 회사명을 돌려준다', async () => {
    await sendVerificationCode(newEmail)
    const { verificationToken } = await confirmVerificationCode({
      email: newEmail,
      code: MOCK_VERIFICATION_CODE,
    })

    expect(await signUp({ ...signUpBody, verificationToken })).toMatchObject({
      email: newEmail,
    })
    await expect(
      signUp({ ...signUpBody, verificationToken }),
    ).rejects.toMatchObject({ code: 'VERIFICATION_EXPIRED' })

    expect(await getMe()).toBeNull()
    await login({ email: newEmail, password: 'abcd1234' })
    expect(await getMe()).toMatchObject({
      managerName: '김담당',
      companyName: '다음스낵',
    })
  })
})
