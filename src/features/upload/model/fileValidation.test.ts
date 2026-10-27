import { describe, expect, it } from 'vitest'

import { validateUploadFile } from './fileValidation'

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
      '파일명에서 연·월을 찾을 수 없어요.',
    )
  })
})
