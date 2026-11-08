import { beforeEach, expect, it } from 'vitest'
import { makePreview, version } from '../__fixtures__/review'
import {
  clearReceiptAttempts,
  readAttempt,
  storeAttempt,
  type Attempt,
} from './attemptStorage'
const request = {
  expectedVersion: version,
  action: 'KEEP' as const,
  receiptIds: [],
  reason: '합성 확인 이유',
  idempotencyKey: crypto.randomUUID(),
}
const attempt: Attempt = {
  request,
  preview: makePreview(request),
  phase: 'unknown',
}
beforeEach(() => sessionStorage.clear())
it('응답 미확인 요청은 같은 계정·같은 review에서만 복원한다', () => {
  storeAttempt('first@example.test', 1, attempt)
  expect(readAttempt('first@example.test', 1)).toEqual(attempt)
  expect(readAttempt('second@example.test', 1)).toBeNull()
  expect(readAttempt('first@example.test', 2)).toBeNull()
})
it('손상된 보관 내용은 쓰기 요청으로 복원하지 않는다', () => {
  storeAttempt('first@example.test', 1, {
    ...attempt,
    request: { ...request, expectedVersion: 'invalid' },
  })
  expect(readAttempt('first@example.test', 1)).toBeNull()
})
it('로그아웃 정리는 다른 기능의 브라우저 자료를 지우지 않는다', () => {
  sessionStorage.setItem('unrelated-test-data', 'keep')
  storeAttempt('first@example.test', 1, attempt)
  clearReceiptAttempts()
  expect(readAttempt('first@example.test', 1)).toBeNull()
  expect(sessionStorage.getItem('unrelated-test-data')).toBe('keep')
})
