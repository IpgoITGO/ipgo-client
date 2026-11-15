import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import styles from './SkuNav.module.css'

// 대시보드가 마지막으로 보여 준 목록(탭·정렬·검색이 적용된 순서)과 그 주소.
// 상품 상세에서 돌아가거나 이전·다음 상품으로 넘길 때 쓴다(11/15: 돌아갈 길이 브라우저 뒤로 가기뿐이었다).
const KEY = 'ipgo:dashboard-list'
type Saved = { search: string; label: string; items: Array<[string, string]> }

/** 대시보드가 목록을 그릴 때마다 끼워 두는 조각(화면에는 아무것도 안 그린다) */
export function RememberDashboardList({ search, label, items }: Saved) {
  const saved = JSON.stringify({ search, label, items })
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, saved)
    } catch {
      /* 기억 못 해도 화면은 돈다 */
    }
  }, [saved])
  return null
}

function readDashboardList(): Saved | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Saved
    return saved && Array.isArray(saved.items) ? saved : null
  } catch {
    return null
  }
}

export function SkuNav({ productId }: { productId: string }) {
  const saved = readDashboardList()
  const items = saved?.items ?? []
  const index = items.findIndex(([id]) => id === productId)
  const prev = index > 0 ? items[index - 1] : null
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null
  return (
    <nav aria-label="상품 이동" className={styles.nav}>
      <Link className={styles.back} to={`/dashboard${saved?.search ?? ''}`}>
        ← 대시보드로
      </Link>
      {index >= 0 && items.length > 1 && (
        <div className={styles.step}>
          <span>
            {saved?.label} {index + 1} / {items.length}
          </span>
          {prev ? (
            <Link
              aria-label={`이전 상품: ${prev[1]}`}
              className={styles.arrow}
              title={prev[1]}
              to={`/sku/${prev[0]}`}
            >
              ‹
            </Link>
          ) : (
            <span aria-hidden="true" className={styles.arrow} data-off>
              ‹
            </span>
          )}
          {next ? (
            <Link
              aria-label={`다음 상품: ${next[1]}`}
              className={styles.arrow}
              title={next[1]}
              to={`/sku/${next[0]}`}
            >
              ›
            </Link>
          ) : (
            <span aria-hidden="true" className={styles.arrow} data-off>
              ›
            </span>
          )}
        </div>
      )}
    </nav>
  )
}
