export const PAGE_SIZES = [10, 20, 30] as const

// 1 … 4 5 6 … 12 처럼 처음·끝·지금 앞뒤만(쪽이 7개 이하면 다)
// 쪽 번호는 10개씩 보인다(11/15 "기본처럼"). 1~10쪽에선 1~10, 10쪽에 가면 6~15처럼 지금 쪽 뒤로 5쪽이 보이게 민다
export function pageList(page: number, pages: number): number[] {
  const end = Math.min(pages, Math.max(10, page + 5))
  const start = Math.max(1, end - 9)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
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
