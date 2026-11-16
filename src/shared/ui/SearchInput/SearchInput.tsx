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
// 조합 외에는 부모 값을 그대로 읽으므로 주소 이동·검색 초기화도 즉시 반영한다.
export function SearchInput({
  value,
  onValueChange,
  ...props
}: SearchInputProps) {
  const composing = useRef(false)
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      {...props}
      type="search"
      value={draft ?? value}
      onCompositionStart={(event) => {
        composing.current = true
        setDraft(event.currentTarget.value)
      }}
      onCompositionEnd={(event) => {
        composing.current = false
        setDraft(null)
        if (event.currentTarget.value !== value)
          onValueChange(event.currentTarget.value)
      }}
      onChange={(event) => {
        if (composing.current) setDraft(event.currentTarget.value)
        else if (event.currentTarget.value !== value)
          onValueChange(event.currentTarget.value)
      }}
    />
  )
}
