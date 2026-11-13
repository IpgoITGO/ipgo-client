import { describe, expect, it } from 'vitest'

import { isBusinessRegistrationNumber } from './businessRegistration'

describe('사업자번호 검증 숫자', () => {
  // 합성 번호이며 실제 등록 여부를 뜻하지 않는다. 9번째 자리의 자리올림과 검증값 0 포함.
  it.each(['1234567891', '1234567800', '1234567815', '1234567829'])(
    '검증 숫자가 맞는 숫자열 %s를 허용한다',
    (value) => expect(isBusinessRegistrationNumber(value)).toBe(true),
  )

  it.each([
    undefined,
    null,
    '',
    '12345',
    '12345678910',
    '1234567890',
    'abc4567891',
    '123-45-67891',
  ])('누락·형식·검증 숫자가 틀린 %s를 거절한다', (value) =>
    expect(isBusinessRegistrationNumber(value)).toBe(false),
  )
})
