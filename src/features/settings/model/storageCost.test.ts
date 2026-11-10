import { beforeEach, describe, expect, it } from 'vitest'

import { login } from '../../../auth/api/authApi'

import {
  cbmOf,
  formatCbm,
  withCommas,
  loadStorageSettings,
  monthlyStorageCost,
  positiveNumber,
  saveBox,
  saveRate,
  storageCostTotal,
} from './storageCost'

const blanket = { width: 20, depth: 20, height: 30 }

describe('보관 비용', () => {
  beforeEach(async () => {
    await login({ email: 'seller@a.com', password: 'pass1234' })
  })

  it('20×20×30cm 상자는 0.012 CBM', () => {
    expect(formatCbm(cbmOf(blanket))).toBe('0.012')
  })

  it('0.012 CBM × 120개 × 45,000원 = 한 달 64,800원(시안 예시)', () => {
    expect(monthlyStorageCost(blanket, 120, 45000)).toBe(64800)
  })

  it('크기·요율·수량 중 하나라도 없으면 0원이 아니라 null', () => {
    expect(monthlyStorageCost(undefined, 120, 45000)).toBeNull()
    expect(monthlyStorageCost(blanket, 120, null)).toBeNull()
    expect(monthlyStorageCost(blanket, null, 45000)).toBeNull()
  })

  it('합계는 크기 미입력 상품을 빼고 따로 센다', () => {
    const result = storageCostTotal(
      [
        { id: '1', quantity: 120 },
        { id: '2', quantity: 50 },
      ],
      { ratePerCbm: 45000, boxes: { '1': blanket } },
    )
    expect(result).toEqual({ total: 64800, missing: 1, counted: 1 })
  })

  it('0·음수·빈 값·글자는 받지 않는다', () => {
    expect(positiveNumber('45,000')).toBe(45000)
    expect(positiveNumber('0')).toBeNull()
    expect(positiveNumber('-3')).toBeNull()
    expect(positiveNumber('')).toBeNull()
    expect(positiveNumber('abc')).toBeNull()
  })

  it('서버에 저장한 요율·상자를 다시 읽고, 지우면 사라진다', async () => {
    expect(await loadStorageSettings()).toEqual({ ratePerCbm: null, boxes: {} })
    await saveRate(45000)
    await saveBox('1', blanket)
    expect(await loadStorageSettings()).toEqual({
      ratePerCbm: 45000,
      boxes: { '1': blanket },
    })
    await saveRate(null)
    await saveBox('1', null)
    expect(await loadStorageSettings()).toEqual({ ratePerCbm: null, boxes: {} })
  })

  it('0 이하 상자는 서버가 400으로 거절한다', async () => {
    await expect(saveBox('1', { ...blanket, depth: 0 })).rejects.toMatchObject({
      status: 400,
    })
  })
})

it('금액 칸은 치는 동안 천 단위 쉼표를 붙이고 숫자 말고는 지운다', () => {
  expect(withCommas('12000')).toBe('12,000')
  expect(withCommas('1,2a3 4')).toBe('1,234')
  expect(withCommas('007')).toBe('7')
  expect(withCommas('')).toBe('')
})
