import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import { UploadReceiptSnapshot } from './UploadReceiptSnapshot'
it('정제 완료와 별개인 모든 사유·미지 사유를 과거 기록으로 표시하고 최신 조회로 연결한다', () => {
  const reasons = [
    'SOURCE_CHANGED',
    'INSUFFICIENT_QUANTITY',
    'REGISTRATION_DAY',
    'NO_EXPECTED_DATE',
    'INVALID_OBSERVATION',
    'PREVIOUSLY_EVALUATED',
    'UNKNOWN_NEW_REASON',
  ]
  render(
    <MemoryRouter>
      <UploadReceiptSnapshot
        matching={{
          status: 'REVIEW_REQUIRED',
          issues: reasons.map((reason, i) => ({
            productId: i + 1,
            stockDate: '2026-11-08',
            reason,
          })),
        }}
      />
    </MemoryRouter>,
  )
  expect(screen.getByText(/처리할 당시의 기록/)).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(7)
  expect(screen.getByText(/원본 입고 내용이 바뀌었어요/)).toBeInTheDocument()
  expect(screen.getByText(/자동으로 확정할 수 없는 입고/)).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: '현재 입고 확인 상태 보기' }),
  ).toHaveAttribute('href', '/receipt-corrections')
})
it('미평가·없는 구버전·정상 평가 응답을 구분한다', () => {
  const view = render(
    <MemoryRouter>
      <UploadReceiptSnapshot
        matching={{ status: 'NOT_EVALUATED', issues: [] }}
      />
    </MemoryRouter>,
  )
  expect(screen.getByText(/아직 평가하지 않았어요/)).toBeInTheDocument()
  view.rerender(
    <MemoryRouter>
      <UploadReceiptSnapshot matching={undefined} />
    </MemoryRouter>,
  )
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  view.rerender(
    <MemoryRouter>
      <UploadReceiptSnapshot matching={{ status: 'EVALUATED', issues: [] }} />
    </MemoryRouter>,
  )
  expect(screen.queryByText(/정제 완료와/)).not.toBeInTheDocument()
})
