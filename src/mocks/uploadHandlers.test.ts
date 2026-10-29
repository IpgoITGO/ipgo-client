// @vitest-environment node
// jsdom의 FormData는 Node fetch로 보낼 수 없어서, 올리기 handler는 node 환경에서 확인한다.
import { beforeAll, describe, expect, it, vi } from 'vitest'

// handler의 /api 주소를 http://localhost 기준으로 읽게 하고,
// 공용 setup이 쿠키(document.cookie)를 비우는 자리는 빈 객체로 채운다.
beforeAll(() => {
  vi.stubGlobal('location', new URL('http://localhost/'))
  Object.assign(globalThis, { document: { cookie: '' } })
})

function upload(name: string, overwrite: boolean) {
  const form = new FormData()
  form.append('file', new File(['x'], name))
  form.append('overwrite', String(overwrite))

  return fetch('http://localhost/api/uploads', { body: form, method: 'POST' })
}

describe('upload mock handlers', () => {
  it('새 기간은 202로 처리를 시작한다', async () => {
    const response = await upload('2026-10.xlsx', false)

    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ status: 'PROCESSING' })
  })

  it('이미 올린 기간은 409 UPLOAD_DUPLICATE, 덮어쓰기면 202', async () => {
    const duplicate = await upload('2026-09.xlsx', false)
    const body = await duplicate.json()

    expect(duplicate.status).toBe(409)
    expect(body.code).toBe('UPLOAD_DUPLICATE')
    expect(body.details.existing.uploadId).toBe(12)
    expect((await upload('2026-09.xlsx', true)).status).toBe(202)
  })

  it('파일을 두 개 넣거나 옛 files 칸으로 보내면 400 INVALID_INPUT', async () => {
    const two = new FormData()
    two.append('file', new File(['x'], '2026-10.xlsx'))
    two.append('file', new File(['y'], '2026-11.xlsx'))
    const old = new FormData()
    old.append('files', new File(['x'], '2026-10.xlsx'))

    for (const body of [two, old]) {
      const response = await fetch('http://localhost/api/uploads', {
        body,
        method: 'POST',
      })
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe('INVALID_INPUT')
    }
  })

  it('형식이 맞지 않으면 400 UPLOAD_INVALID_FORMAT', async () => {
    const response = await upload('재고현황.xlsx', false)

    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('UPLOAD_INVALID_FORMAT')
  })
})
