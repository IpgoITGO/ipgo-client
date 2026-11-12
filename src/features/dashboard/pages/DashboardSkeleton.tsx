import { shortDate } from '../../../shared/lib/elapsed'
import styles from './DashboardSkeleton.module.css'

const ROW_WIDTHS = ['100%', '80%', '65%', '72%']
/** 기다리는 동안 보여 줄 지난 결과 한 마디(전부 대시보드가 이미 가진 값) */
export type WaitNote = {
  baseDate: string
  top?: { name: string; quantity: number }
  needed: number
  soon: number
  planned: number
}

// 계산 중 대시보드: 위는 안내 한 상자(지난 결과 세 줄 포함), 아래는 실제 화면과 같은 배치의 자리.
export function DashboardSkeleton({ note }: { note?: WaitNote }) {
  const weekLeft = note && note.soon > 0
  return (
    <div className={styles.root} data-testid="dashboard-skeleton">
      <section aria-label="계산 중" className={styles.wait}>
        <div className={styles.talk}>
          <div className={styles.say}>
            <strong>새 수불부로 입고량을 계산하고 있어요</strong>
            <span>
              창을 닫거나 다른 화면을 봐도 계산은 계속돼요. 끝나면 오른쪽
              아래에서 알려 드려요.
            </span>
          </div>
          {note && (
            <div className={styles.memo}>
              <ul>
                {note.top && (
                  <li>
                    지난번({shortDate(note.baseDate)}) 가장 급했던 건{' '}
                    <mark>{note.top.name}</mark> · 권장{' '}
                    {note.top.quantity.toLocaleString()}개
                  </li>
                )}
                {note.needed > 0 && (
                  <li>
                    지금 넣을 상품 <b>{note.needed}개</b>
                    {weekLeft ? (
                      <>
                        {' '}
                        중 <b>{note.soon}개</b>는 이번 주 안에 바닥나요
                      </>
                    ) : (
                      '가 기다리고 있어요'
                    )}
                  </li>
                )}
                {note.planned > 0 && (
                  <li>
                    정해 둔 내 입고량 <b>{note.planned}개 상품</b>은 새 결과가
                    나와도 그대로 남아요
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </section>

      <div aria-hidden="true" className={styles.rest}>
        <div className={styles.boxes}>
          {/* 실제 화면과 같이 요약 카드 4장(11/12) */}
          {[0, 1, 2, 3].map((i) => (
            <div className={styles.card} key={i}>
              <span className={`${styles.sk} ${styles.a}`} />
              <span className={`${styles.sk} ${styles.b}`} />
              <span className={`${styles.sk} ${styles.c}`} />
            </div>
          ))}
        </div>
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <span className={`${styles.sk} ${styles.search}`} />
          </div>
          <span className={`${styles.sk} ${styles.h}`} />
          {ROW_WIDTHS.map((w) => (
            <div className={styles.row} key={w}>
              <span className={`${styles.sk} ${styles.ck}`} />
              <span className={styles.sk} style={{ width: w }} />
              {/* 상태·소진일·품절 위험·유통기한·입고량·금액 */}
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span className={styles.sk} key={i} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
