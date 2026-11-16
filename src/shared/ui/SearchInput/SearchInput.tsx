import { type InputHTMLAttributes, useRef, useState } from 'react'

type SearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  | 'value'
  | 'defaultValue'
  | 'onChange'
  | 'onCompositionStart'
  | 'onCompositionEnd'
  | 'type'
> & {
  value: string
  onValueChange: (value: string) => void
}

// 한글 조합 중에는 URL을 바꾸지 않아 입력기의 조합이 끊기지 않는다.
// 조합 종료 뒤 주소 반영이 늦어져도 입력값을 유지한다. 외부 주소 변경은 다시 읽는다.
export function SearchInput({
  value,
  onValueChange,
  ...props
}: SearchInputProps) {
  const composing = useRef(false)
  const [input, setInput] = useState({
    source: value,
    text: value,
    composing: false,
  })
  if (input.source !== value)
    setInput({
      ...input,
      source: value,
      text: input.composing ? input.text : value,
    })
  return (
    <input
      {...props}
      type="search"
      value={input.text}
      onCompositionStart={() => {
        composing.current = true
        setInput((previous) => ({ ...previous, composing: true }))
      }}
      onCompositionEnd={(event) => {
        composing.current = false
        const text = event.currentTarget.value
        setInput((previous) => ({ ...previous, text, composing: false }))
        if (text !== value) onValueChange(text)
      }}
      onChange={(event) => {
        const text = event.currentTarget.value
        setInput((previous) => ({ ...previous, text }))
        if (!composing.current && text !== value) onValueChange(text)
      }}
    />
  )
}
