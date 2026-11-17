import { Link } from 'react-router-dom'

import { shortDate } from '../../../shared/lib/elapsed'
import type { CheckReason } from '../model/checkFirst'
import styles from './CheckFirst.module.css'

// 확인할 상품은 두 줄까지만 보여 준다: 자료가 늦게 와도(유통기한) 카드 높이가 그대로라 아래 카드·표가 안 밀린다
const SHOWN = 2

/** 먼저 볼 상품이 없을 때 오른쪽 두 줄을 채울 값(대시보드가 이미 가진 값) */
export type CheckFill = {
  /** 예상 소진일이 가장 이른 상품 */
  urgent?: {
    id: string
    name: string
    date: string
    quantity: number
    /** 소진일이 이미 지났다 */
    past: boolean
  }
  /** 이번 주 안에 바닥나는 상품 수 */
  soon: number
}

// 대시보드 맨 위 요약 카드(11/15 "가", 11/17 요약 모양): 넣어야 할 상품 중 권장대로 넣으면 되는 것과 먼저 볼 것을 가른다.
// 왼쪽은 연한 노랑 칸의 한 마디(들어올 때 형광펜과 함께 한 번 써진다), 오른쪽은 먼저 볼 상품 두 줄.
// 먼저 볼 상품이 없으면 오른쪽을 "가장 급한 상품·이번 주 안에 바닥나는 수"로 채운다(빈칸으로 두지 않는다).
// 문장은 규칙으로 만든 것이라 "AI"라고 적지 않는다.
export function CheckFirst({
  total,
  reasons,
  fill,
}: {
  /** 지금 넣어야 할 상품 수 */
  total: number
  reasons: CheckReason[]
  fill?: CheckFill
}) {
  if (total === 0) return null
  const fine = total - reasons.length
  return (
    <section aria-label="먼저 확인할 상품" className={styles.card}>
      <p className={styles.say}>
        <span className={styles.chip}>
          <i aria-hidden="true">✦</i>
          오늘의 요약
        </span>
        <strong>
          {reasons.length === 0 ? (
            <>
              {total}개 모두 <mark>권장대로</mark> 넣으면 돼요
            </>
          ) : fine > 0 ? (
            <>
              {total}개 중 <mark>{fine}개는 권장대로</mark> 넣으면 돼요
            </>
          ) : (
            <>{total}개 모두 먼저 확인해 주세요</>
          )}
        </strong>
        {reasons.length === 0 ? (
          <small>먼저 볼 상품은 없어요</small>
        ) : (
          fine > 0 && <small>{reasons.length}개만 먼저 확인해 주세요</small>
        )}
      </p>
      <ul className={styles.rows}>
        {reasons.length === 0 && fill?.urgent && (
          <li>
            <Link to={`/sku/${fill.urgent.id}`}>
              <b>가장 급한 상품</b>
              <span>
                <em>{fill.urgent.name}</em> · {shortDate(fill.urgent.date)}
                {fill.urgent.past
                  ? '에 이미 바닥났을 수 있어요'
                  : '에 바닥나요'}{' '}
                · 권장 {fill.urgent.quantity.toLocaleString()}개
              </span>
              <small aria-hidden="true">보기 →</small>
            </Link>
          </li>
        )}
        {reasons.length === 0 && fill && (
          <li>
            <div>
              <b>이번 주 안에</b>
              <span>
                {fill.soon > 0 ? (
                  <>
                    {total}개 중 <em>{fill.soon}개</em>가 바닥나요
                  </>
                ) : (
                  '바닥나는 상품은 없어요'
                )}
              </span>
            </div>
          </li>
        )}
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
