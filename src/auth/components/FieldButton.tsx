import type { ComponentProps } from 'react'

import styles from './FieldButton.module.css'

type FieldButtonProps = ComponentProps<'button'> & {
  variant?: 'soft' | 'solid'
}

// 입력칸 옆에 놓는 버튼 (중복 확인 · 코드 확인). 입력칸과 높이가 같습니다.
export function FieldButton({ variant = 'soft', ...props }: FieldButtonProps) {
  return (
    <button
      className={`${styles.button} ${styles[variant]}`}
      type="button"
      {...props}
    />
  )
}
