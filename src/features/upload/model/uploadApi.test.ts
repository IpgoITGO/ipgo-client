import { describe, expect, it, vi } from 'vitest'
import { uploadFile } from './uploadApi'
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
})
