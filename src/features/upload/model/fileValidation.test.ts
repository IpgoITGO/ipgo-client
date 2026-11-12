import { describe, expect, it } from 'vitest'

import { replacedLabel, validateUploadFile } from './fileValidation'

describe('validateUploadFile', () => {
  it('정상 XLSX 파일에서 기간을 읽는다', () => {
    const result = validateUploadFile(new File(['data'], '2026-09.xlsx'))

    expect(result.status).toBe('ready')
    expect(result.period).toBe('2026년 9월')
  })

  it('잘못된 형식과 파일명을 구분한다', () => {
    expect(validateUploadFile(new File(['data'], '2026-09.xls')).reason).toBe(
      'XLSX 파일만 올릴 수 있어요.',
    )
    expect(validateUploadFile(new File(['data'], '재고현황.xlsx')).reason).toBe(
      '파일명을 2026-09.xlsx처럼 연-월 형식으로 바꿔 주세요.',
    )
  })
})

for (const name of ['2026-09 1.xlsx', '2026-10 1.xlsx', '2026-09 (1).xlsx']) {
  it(`복사본 이름 ${name}에서 기간을 읽는다`, () => {
    expect(validateUploadFile(new File(['same bytes'], name)).status).toBe(
      'ready',
    )
  })
}
it('서로 다른 월이 섞인 이름은 추측하지 않는다', () => {
  expect(
    validateUploadFile(new File(['data'], '2026-09 2026-10.xlsx')).status,
  ).toBe('error')
})

describe('replacedLabel', () => {
  it('몇 개월인지와, 3개까지는 그 달들·넘으면 처음 ~ 끝을 준다', () => {
    expect(replacedLabel(['2026년 11월'])).toEqual({
      count: 1,
      months: '2026년 11월',
    })
    expect(
      replacedLabel([
        '2026년 1월',
        '2025년 12월',
        '2025년 9월',
        '2026년 1월',
        '2025년 10월',
      ]),
    ).toEqual({ count: 4, months: '2025년 9월 ~ 2026년 1월' })
  })
})
