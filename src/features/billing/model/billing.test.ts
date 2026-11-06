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
    expect(nextBillingOn(sub, nov5)).toBe('2026-12-05')
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
  it('다음 결제일은 오늘이 지났으면 한 달씩 넘긴다', () => {
    const sub = {
      plan: 'seller' as const,
      startedOn: '2026-09-05',
      method: 'card' as const,
      history: [],
    }
    expect(nextBillingOn(sub, new Date(2026, 10, 6))).toBe('2026-12-05')
    expect(nextBillingOn(sub, new Date(2026, 9, 1))).toBe('2026-10-05')
  })

  it('월말에 시작하면 없는 날은 그 달 말일, 다음 달엔 원래 일자로 돌아온다', () => {
    const at = (startedOn: string) =>
      ({ ...loadSubscription(), plan: 'seller', startedOn }) as const
    // 7/31 시작 · 오늘 10/2 → 9/30을 지나 10/31(11/1로 밀리지 않음)
    expect(nextBillingOn(at('2026-07-31'), new Date(2026, 9, 2))).toBe(
      '2026-10-31',
    )
    // 윤년 2월: 1/31 시작 → 2/29 → 3/31
    expect(nextBillingOn(at('2028-01-31'), new Date(2028, 1, 1))).toBe(
      '2028-02-29',
    )
    expect(nextBillingOn(at('2028-01-31'), new Date(2028, 1, 29))).toBe(
      '2028-03-31',
    )
    // 평년 2월: 2/28
    expect(nextBillingOn(at('2027-01-31'), new Date(2027, 1, 1))).toBe(
      '2027-02-28',
    )
  })
})
