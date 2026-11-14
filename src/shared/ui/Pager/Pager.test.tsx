import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Pager } from './Pager'
import { pageList, readPage } from './pageParams'

describe('Pager', () => {
  it('쪽 번호는 처음·끝·지금 앞뒤만 보이고 사이는 …', () => {
    expect(pageList(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageList(6, 12)).toEqual([1, null, 5, 6, 7, null, 12])
    expect(pageList(1, 12)).toEqual([1, 2, null, 12])
  })

  it('주소의 이상한 page·size는 1쪽·10개로, 넘친 쪽은 마지막 쪽으로', () => {
    expect(readPage(new URLSearchParams('page=x&size=7'), 50)).toEqual({
      page: 1,
      size: 10,
    })
    expect(readPage(new URLSearchParams('page=9&size=20'), 50)).toEqual({
      page: 3,
      size: 20,
    })
  })

  it('개수를 고르고 쪽을 넘긴다', async () => {
    const onPage = vi.fn()
    const onSize = vi.fn()
    render(
      <Pager
        label="상품"
        onPage={onPage}
        onSize={onSize}
        page={1}
        size={10}
        total={25}
      />,
    )
    expect(screen.getByText('25개 중 1–10')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '다음 쪽' }))
    expect(onPage).toHaveBeenCalledWith(2)
    await userEvent.selectOptions(
      screen.getByLabelText('상품 한 번에 볼 개수'),
      '30',
    )
    expect(onSize).toHaveBeenCalledWith(30)
  })
})
