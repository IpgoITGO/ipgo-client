import { describe, expect, it } from 'vitest'

import { expireMockRegistrationSession } from './billingHandlers'

import { openApp } from '../../../test/openApp'
import {
  billingPost,
  getSession,
  type RegistrationSession,
} from '../model/billingApi'

const body = { purpose: 'REPLACE_METHOD', consentVersion: 'monthly-2026-11-v1' }
const register = (key: string) =>
  billingPost<RegistrationSession>('/registration-sessions', key, body)

describe('등록 세션 MSW 계약', () => {
  it('OPEN은 같은 키와 새 키로 이어받고 완료된 키는 409다', async () => {
    await openApp('/account')
    const first = await register('register-key-one')
    expect((await register('register-key-one')).sessionId).toBe(first.sessionId)
    expect((await register('register-key-two')).sessionId).toBe(first.sessionId)
    await billingPost(
      `/registration-sessions/${first.sessionId}/complete`,
      'complete-key-one',
      { authKey: 'mock_auth' },
    )
    expect((await getSession(first.sessionId)).status).toBe('COMPLETED')
    await expect(register('register-key-one')).rejects.toMatchObject({
      status: 409,
      code: 'BILLING_IN_PROGRESS',
    })
    const next = await register('register-key-three')
    expect(next.sessionId).not.toBe(first.sessionId)
  })

  it('취소된 세션의 같은 키는 409로 거절한다', async () => {
    await openApp('/account')
    const first = await register('register-key-one')
    await billingPost(
      `/registration-sessions/${first.sessionId}/cancel`,
      'cancel-key-one',
    )
    await expect(register('register-key-one')).rejects.toMatchObject({
      status: 409,
      code: 'BILLING_SESSION_CANCELED',
    })
  })
  it('만료된 세션의 같은 키는 409로 거절한다', async () => {
    await openApp('/account')
    const first = await register('register-key-one')
    expireMockRegistrationSession(first.sessionId)
    await expect(register('register-key-one')).rejects.toMatchObject({
      status: 409,
      code: 'BILLING_SESSION_EXPIRED',
    })
  })
})
