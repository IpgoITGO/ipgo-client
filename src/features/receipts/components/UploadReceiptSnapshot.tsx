import { Link } from 'react-router-dom'
import type { UploadResult } from '../../upload/model/uploadApi'
import { reasonText } from '../model/receiptApi'
export function UploadReceiptSnapshot({
  matching,
}: {
  matching: UploadResult['receiptMatching']
}) {
  if (
    !matching ||
    (matching.status === 'EVALUATED' && matching.issues.length === 0)
  )
    return null
  return (
    <section aria-label="업로드 당시 입고 확인 사항">
      <h2>정제 완료와 입고 확인은 별개예요</h2>
      <p>
        아래 내용은 이 업로드를 처리할 당시의 기록이에요. 이후 확정한 현재
        상태와 다를 수 있어요.
      </p>
      {matching.status === 'NOT_EVALUATED' && (
        <p>업로드 당시 입고 확인을 아직 평가하지 않았어요.</p>
      )}
      <ul>
        {matching.issues.map((issue, i) => (
          <li key={`${issue.productId}-${issue.stockDate}-${i}`}>
            {issue.stockDate} · {reasonText(issue.reason)}{' '}
            <Link to={`/sku/${issue.productId}`}>상품·발주 확인</Link>
          </li>
        ))}
      </ul>
      <Link to="/receipt-corrections">현재 입고 확인 상태 보기</Link>
    </section>
  )
}
