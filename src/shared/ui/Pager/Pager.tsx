import type { ReactNode } from 'react'

import { PAGE_SIZES, pageList } from './pageParams'
import styles from './Pager.module.css'

// 긴 목록 아래 "10·20·30개씩 보기 + 쪽 번호"(11/13). 쪽이 하나뿐이어도 보기 개수는 고를 수 있게 둔다
export function Pager({
  label,
  page,
  size,
  total,
  onPage,
  onSize,
  aside,
}: {
  label: string
  page: number
  size: number
  total: number
  onPage: (page: number) => void
  onSize: (size: number) => void
  /** 오른쪽 끝 빈 칸에 둘 것(예: 대시보드의 "고르면 엑셀로" 안내) */
  aside?: ReactNode
}) {
  const pages = Math.max(1, Math.ceil(total / size))
  return (
    <nav aria-label={`${label} 쪽`} className={styles.pager}>
      <label className={styles.size}>
        <select
          aria-label={`${label} 한 번에 볼 개수`}
          onChange={(event) => onSize(Number(event.target.value))}
          value={size}
        >
          {PAGE_SIZES.map((option) => (
            <option key={option} value={option}>
              {option}개씩
            </option>
          ))}
        </select>
      </label>
      <div className={styles.pages}>
        <button
          aria-label="앞 쪽"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          type="button"
        >
          ‹
        </button>
        {pageList(page, pages).map((item) => (
          <button
            aria-current={item === page ? 'page' : undefined}
            aria-label={`${item}쪽`}
            key={item}
            onClick={() => onPage(item)}
            type="button"
          >
            {item}
          </button>
        ))}
        <button
          aria-label="다음 쪽"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          type="button"
        >
          ›
        </button>
      </div>
      {aside && <div className={styles.aside}>{aside}</div>}
    </nav>
  )
}
