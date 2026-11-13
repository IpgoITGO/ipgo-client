import { describe, expect, it, vi } from 'vitest'
import { uploadFailureMessage, uploadFile } from './uploadApi'
import { apiRequest } from '../../../shared/api/client'
vi.mock('../../../shared/api/client', () => ({ apiRequest: vi.fn() }))
describe('uploadFile 월별 서버 계약', () => {
  it('복사본의 원본 바이트를 유지하고 월별 이름으로 전송한다', async () => {
    const file = new File(['original workbook bytes'], '2026-09 1.xlsx')
    await uploadFile(file, true)
    const body = vi.mocked(apiRequest).mock.calls[0][1]?.body as FormData
    const sent = body.get('file') as File
    expect(sent.name).toBe('2026-09.xlsx')
    expect(sent.size).toBe(file.size)
    expect(body.get('overwrite')).toBe('true')
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(sent)
    })
    expect(text).toBe('original workbook bytes')
  })

  it('연-월이 아닌 이름은 원래 이름 그대로 보낸다(기간은 서버가 입고일자로, 11/13)', async () => {
    vi.mocked(apiRequest).mockClear()
    await uploadFile(new File(['x'], '11월 재고.xlsx'), false)
    const body = vi.mocked(apiRequest).mock.calls[0][1]?.body as FormData
    expect((body.get('file') as File).name).toBe('11월 재고.xlsx')
  })
})

describe('업로드 실패 안내', () => {
  it('입력 오류는 구체적 이유를 우선하고 빈 이유는 기존 안내로 대체한다', () => {
    expect(
      uploadFailureMessage({
        code: 'INVALID_SOURCE',
        message: '기존 안내',
        reason: '  같은 창고인지 확인해 주세요.  ',
      }),
    ).toBe('같은 창고인지 확인해 주세요.')
    expect(
      uploadFailureMessage({
        code: 'INVALID_SOURCE',
        message: '기존 안내',
        reason: '   ',
      }),
    ).toBe('기존 안내')
    expect(uploadFailureMessage(null, '대체 안내')).toBe('대체 안내')
  })

  it('전월 연결 코드는 이유가 없어도 고칠 방법을 안내하고 서버 장애 이유는 숨긴다', () => {
    expect(
      uploadFailureMessage({
        code: 'INVALID_SOURCE',
        message: '기존 안내',
        details: { reason: 'PREVIOUS_MONTH_MISMATCH' },
      }),
    ).toContain('같은 셀러·창고')
    expect(
      uploadFailureMessage({
        code: 'ENGINE_UNAVAILABLE',
        message: '잠시 뒤 다시 올려 주세요.',
        reason: '내부 장애 문자열',
        details: { reason: 'PREVIOUS_MONTH_MISMATCH' },
      }),
    ).toBe('잠시 뒤 다시 올려 주세요.')
  })
})
