export const PAGE_SIZES = [10, 20, 30] as const

// 1 … 4 5 6 … 12 처럼 처음·끝·지금 앞뒤만(쪽이 7개 이하면 다)
export function pageList(page: number, pages: number): Array<number | null> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)
  const near = [page - 1, page, page + 1].filter((p) => p > 1 && p < pages)
  const list: Array<number | null> = [1]
  if (near[0] > 2) list.push(null)
  list.push(...near)
  if (near[near.length - 1] < pages - 1) list.push(null)
  list.push(pages)
  return list
}

// 주소의 page·size를 읽는다. 이상한 값이면 1쪽·10개(11/13 주소로 목록 상태 관리)
export function readPage(params: URLSearchParams, total: number) {
  const rawSize = Number(params.get('size'))
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize)
    ? rawSize
    : 10
  const pages = Math.max(1, Math.ceil(total / size))
  const rawPage = Number(params.get('page'))
  const page =
    Number.isInteger(rawPage) && rawPage >= 1 ? Math.min(rawPage, pages) : 1
  return { page, size }
}
