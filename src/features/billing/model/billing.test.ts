import { beforeEach, describe, expect, it } from 'vitest'

import {
  calcLock,
  loadSubscription,
  nextBillingOn,
  planOf,
  subscribe,
  trialDaysLeft,
} from './billing'

const nov5 = new Date(2026, 10, 5)

describe('요금제·구독', () => {
  beforeEach(() => localStorage.clear())

  it('처음 열면 오늘부터 14일 체험이 시작된다', () => {
    const sub = loadSubscription(nov5)
    expect(sub.plan).toBe('trial')
    expect(trialDaysLeft(sub, nov5)).toBe(14)
    expect(trialDaysLeft(sub, new Date(2026, 10, 19))).toBe(0)
    expect(trialDaysLeft(sub, new Date(2026, 10, 25))).toBe(0)
  })

  it('셀러로 바꾸면 결제 내역이 쌓이고 다음 결제일은 한 달 뒤', () => {
    const sub = subscribe(loadSubscription(nov5), 'seller', 'card', nov5)
    expect(sub.history[0]).toEqual({
      paidOn: '2026-11-05',
      plan: 'seller',
      amount: 49000,
      method: 'card',
    })
    expect(nextBillingOn(sub)).toBe('2026-12-05')
    expect(loadSubscription().plan).toBe('seller')
  })

  it('추천은 셀러 하나', () => {
    expect(planOf('seller').recommended).toBe(true)
    expect(planOf('business').recommended).toBeUndefined()
  })
})

describe('계산 막기(calcLock)', () => {
  beforeEach(() => localStorage.clear())

  it('체험 중이면 안 막고, 끝나는 날부터 TRIAL_ENDED', () => {
    const sub = loadSubscription(nov5)
    expect(calcLock(sub, new Date(2026, 10, 18))).toBeNull()
    expect(calcLock(sub, new Date(2026, 10, 19))).toEqual({
      reason: 'TRIAL_ENDED',
    })
  })

  it('유료는 결제 실패 마감(실패일+7일)이 지나야 PAYMENT_FAILED', () => {
    const paid = subscribe(loadSubscription(nov5), 'seller', 'card', nov5)
    expect(calcLock(paid, new Date(2026, 11, 30))).toBeNull()
    const failed = { ...paid, renewalFailed: { on: '2026-11-04', reason: 'x' } }
    expect(calcLock(failed, new Date(2026, 10, 11))).toBeNull()
    expect(calcLock(failed, new Date(2026, 10, 12))).toEqual({
      reason: 'PAYMENT_FAILED',
    })
  })
})
