import { calculationReasonDetail } from '../../lib/calculationReason'

// "자세한 계산 사유" 펼침. 엔진 문장 대신 기간·판매한 날을 한 줄씩 풀어 쓴다. 풀 게 없으면 그리지 않는다.
export function ReasonDetail({ reason }: { reason: string }) {
  const lines = calculationReasonDetail(reason)
  if (!lines) return null
  return (
    <details>
      <summary>자세한 계산 사유</summary>
      {lines.map((line) => (
        <span key={line} style={{ display: 'block' }}>
          {line}
        </span>
      ))}
    </details>
  )
}
