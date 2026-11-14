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
}: {
  label: string
  page: number
  size: number
  total: number
  onPage: (page: number) => void
  onSize: (size: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / size))
  const from = total === 0 ? 0 : (page - 1) * size + 1
  const to = Math.min(total, page * size)
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
        <span>
          {total.toLocaleString()}개 중 {from}–{to}
        </span>
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
        {pageList(page, pages).map((item, index) =>
          item === null ? (
            <span aria-hidden="true" className={styles.gap} key={`gap${index}`}>
              …
            </span>
          ) : (
            <button
              aria-current={item === page ? 'page' : undefined}
              aria-label={`${item}쪽`}
              key={item}
              onClick={() => onPage(item)}
              type="button"
            >
              {item}
            </button>
          ),
        )}
        <button
          aria-label="다음 쪽"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          type="button"
        >
          ›
        </button>
      </div>
    </nav>
  )
}
