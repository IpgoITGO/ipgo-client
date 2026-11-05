import { type ComponentProps, useState } from 'react'

import styles from './PasswordField.module.css'
import { TextField } from './TextField'

type PasswordFieldProps = Omit<ComponentProps<typeof TextField>, 'type'>

// 비밀번호 칸 + 오른쪽 보기/숨기기 버튼
export function PasswordField(props: PasswordFieldProps) {
  const [shown, setShown] = useState(false)

  return (
    <TextField
      {...props}
      inputClassName={styles.input}
      suffix={
        <button
          aria-label={shown ? '비밀번호 숨기기' : '비밀번호 보기'}
          aria-pressed={shown}
          className={styles.toggle}
          onClick={() => setShown((value) => !value)}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {shown && <path d="M4 4l16 16" />}
          </svg>
        </button>
      }
      type={shown ? 'text' : 'password'}
    />
  )
}
