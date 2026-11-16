import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchInput } from './SearchInput'

describe('검색어와 주소 반영 시점', () => {
  it('이전 검색 주소가 조합 중 늦게 반영돼도 조합 글자를 보존한다', () => {
    const onValueChange = vi.fn()
    const view = render(
      <SearchInput aria-label="검색" value="" onValueChange={onValueChange} />,
    )
    const input = screen.getByRole('searchbox', { name: '검색' })
    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'aㅅ' } })
    view.rerender(
      <SearchInput aria-label="검색" value="a" onValueChange={onValueChange} />,
    )
    expect(input).toHaveValue('aㅅ')
    fireEvent.change(input, { target: { value: 'a실리콘' } })
    fireEvent.compositionEnd(input, { data: '실리콘' })
    expect(input).toHaveValue('a실리콘')
    expect(onValueChange).toHaveBeenLastCalledWith('a실리콘')
  })
  it('주소 반영이 늦어도 조합 완료 글자를 유지하고 외부 주소 변경은 반영한다', () => {
    const onValueChange = vi.fn()
    const view = render(
      <SearchInput aria-label="검색" value="" onValueChange={onValueChange} />,
    )
    const input = screen.getByRole('searchbox', { name: '검색' })
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '실리콘' } })
    fireEvent.compositionEnd(input, { data: '실리콘' })
    expect(input).toHaveValue('실리콘')
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('실리콘')
    view.rerender(
      <SearchInput
        aria-label="검색"
        value="실리콘"
        onValueChange={onValueChange}
      />,
    )
    expect(input).toHaveValue('실리콘')
    view.rerender(
      <SearchInput
        aria-label="검색"
        value="외부검색"
        onValueChange={onValueChange}
      />,
    )
    expect(input).toHaveValue('외부검색')
  })
})
