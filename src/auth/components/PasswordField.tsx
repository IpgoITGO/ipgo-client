import {
  type ChangeEvent,
  type ComponentProps,
  useEffect,
  useState,
} from 'react'

import { stripInvalidPasswordChars } from '../model/passwordRule'
import styles from './PasswordField.module.css'
import { TextField } from './TextField'

type PasswordFieldProps = Omit<ComponentProps<typeof TextField>, 'type'>

// 비밀번호 칸 + 오른쪽 보기/숨기기 버튼.
// 한글·공백은 들어오는 즉시 지우고, 칸 안에 2초 동안 짧게 알린다(칸 아래가 밀리지 않게).
export function PasswordField({ onChange, ...props }: PasswordFieldProps) {
  const [shown, setShown] = useState(false)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (!blocked) return
    const timer = setTimeout(() => setBlocked(false), 2000)
    return () => clearTimeout(timer)
  }, [blocked])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const clean = stripInvalidPasswordChars(event.target.value)
    if (clean !== event.target.value) {
      event.target.value = clean
      setBlocked(true)
    }
    onChange?.(event)
  }

  return (
    <TextField
      {...props}
      autoCapitalize="off"
      inputClassName={blocked ? `${styles.input} ${styles.wide}` : styles.input}
      onChange={handleChange}
      spellCheck={false}
      suffix={
        <>
          {blocked && (
            <span className={styles.blocked} role="status">
              한글·공백은 못 써요
            </span>
          )}
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
        </>
      }
      type={shown ? 'text' : 'password'}
    />
  )
}
