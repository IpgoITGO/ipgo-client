import { afterEach, describe, expect, it } from 'vitest'
import {
  clearTrackedRun,
  readTrackedRun,
  writeTrackedRun,
} from './calculationStorage'

afterEach(clearTrackedRun)
describe('탭 계산 상태 복구', () => {
  it('같은 사용자만 저장된 runId를 복구한다', () => {
    writeTrackedRun('synthetic-owner', 71)
    expect(readTrackedRun('synthetic-owner')).toBe(71)
    expect(readTrackedRun('another-owner')).toBeNull()
    expect(readTrackedRun()).toBeNull()
  })
  it('로그아웃·확인 뒤에는 저장된 계산 번호를 지운다', () => {
    writeTrackedRun('synthetic-owner', 71)
    clearTrackedRun()
    expect(readTrackedRun('synthetic-owner')).toBeNull()
    writeTrackedRun('synthetic-owner', 72)
    writeTrackedRun('synthetic-owner', null)
    expect(readTrackedRun('synthetic-owner')).toBeNull()
  })
  it('손상된 저장값이나 잘못된 번호는 조회에 사용하지 않는다', () => {
    sessionStorage.setItem('ipgo:calculation-run', 'invalid-json')
    expect(readTrackedRun('synthetic-owner')).toBeNull()
    writeTrackedRun('synthetic-owner', -1)
    expect(readTrackedRun('synthetic-owner')).toBeNull()
  })
})
