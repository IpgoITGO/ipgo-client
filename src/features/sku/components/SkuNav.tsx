import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import styles from './SkuNav.module.css'

// 대시보드가 마지막으로 보여 준 목록(탭·정렬·검색이 적용된 순서)과 그 주소.
// 상품 상세에서 이전·다음 상품으로 넘길 때 쓴다(11/15: 돌아갈 길이 브라우저 뒤로 가기뿐이었다).
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

// 상품 이름 위 한 줄: 지금 몇 번째인지 + 이전·다음 상품 단추.
// 화살표만 있을 땐 있는 줄도 몰라서(11/17) 글자가 적힌 보조 버튼 둘로 했다. 어느 상품으로 가는지는 올리면 뜬다.
// "← 대시보드로"는 위 메뉴와 겹쳐서 뺐다(11/17).
export function SkuNav({ productId }: { productId: string }) {
  const saved = readDashboardList()
  const items = saved?.items ?? []
  const index = items.findIndex(([id]) => id === productId)
  if (index < 0 || items.length < 2) return null
  const prev = index > 0 ? items[index - 1] : null
  const next = index < items.length - 1 ? items[index + 1] : null
  return (
    <nav aria-label="상품 이동" className={styles.nav}>
      <p className={styles.where}>
        {saved?.label} <b>{index + 1}</b> / {items.length}
      </p>
      <div className={styles.moves}>
        {prev ? (
          <Link
            aria-label={`이전 상품: ${prev[1]}`}
            className={styles.move}
            title={prev[1]}
            to={`/sku/${prev[0]}`}
          >
            ‹ 이전 상품
          </Link>
        ) : (
          <span aria-hidden="true" className={styles.move} data-off>
            ‹ 이전 상품
          </span>
        )}
        {next ? (
          <Link
            aria-label={`다음 상품: ${next[1]}`}
            className={styles.move}
            title={next[1]}
            to={`/sku/${next[0]}`}
          >
            다음 상품 ›
          </Link>
        ) : (
          <span aria-hidden="true" className={styles.move} data-off>
            다음 상품 ›
          </span>
        )}
      </div>
    </nav>
  )
}
