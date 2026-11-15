import { Link } from 'react-router-dom'

import type { CheckReason } from '../model/checkFirst'
import styles from './CheckFirst.module.css'

// 확인할 상품은 두 줄까지만 보여 준다: 자료가 늦게 와도(유통기한) 카드 높이가 그대로라 아래 카드·표가 안 밀린다
const SHOWN = 2

// 대시보드 맨 위 한 줄(11/15 "가"): 넣어야 할 상품 중 권장대로 넣으면 되는 것과 먼저 볼 것을 가른다.
// 모양은 계산 중 안내 카드(지난 결과 메모)와 같은 결: 흰 카드 · 점선 · 마름모 점 · 형광펜.
export function CheckFirst({
  total,
  reasons,
}: {
  /** 지금 넣어야 할 상품 수 */
  total: number
  reasons: CheckReason[]
}) {
  if (total === 0) return null
  const fine = total - reasons.length
  if (reasons.length === 0)
    return (
      <section aria-label="먼저 확인할 상품" className={styles.card}>
        <p className={styles.say}>
          <strong>
            <i aria-hidden="true">✦</i>
            {total}개 모두 <mark>권장대로</mark> 넣으면 돼요
          </strong>
        </p>
      </section>
    )
  return (
    <section aria-label="먼저 확인할 상품" className={styles.card} data-rows>
      <p className={styles.say}>
        <strong>
          <i aria-hidden="true">✦</i>
          {fine > 0 ? (
            <>
              {total}개 중 <mark>{fine}개는 권장대로</mark> 넣으면 돼요
            </>
          ) : (
            <>{total}개 모두 먼저 확인해 주세요</>
          )}
        </strong>
        {fine > 0 && <span>{reasons.length}개만 먼저 확인해 주세요</span>}
      </p>
      <ul className={styles.rows}>
        {reasons.slice(0, SHOWN).map((reason) => (
          <li key={reason.id}>
            <Link to={`/sku/${reason.id}`}>
              <b>{reason.name}</b>
              <span>
                {reason.lead}
                <em>{reason.strong}</em>
                {reason.tail} · {reason.so}
              </span>
              <small aria-hidden="true">보기 →</small>
            </Link>
          </li>
        ))}
        {reasons.length > SHOWN && (
          <li className={styles.more}>
            외 {reasons.length - SHOWN}개는 아래 목록의 "확인 필요"에서 볼 수
            있어요
          </li>
        )}
      </ul>
    </section>
  )
}
