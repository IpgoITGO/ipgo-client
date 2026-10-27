import { type ComponentProps, type ReactNode, useId } from 'react'

import styles from './TextField.module.css'

type TextFieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  label: ReactNode
  error?: string
  hint?: ReactNode
  success?: boolean // 사용할 수 있는 값 · 인증 완료
  inputClassName?: string // 입력칸 글자 모양처럼 이 칸에만 필요한 스타일
  suffix?: ReactNode // 입력칸 안 오른쪽 (남은 시간 등)
  action?: ReactNode // 입력칸 옆 버튼
}

export function TextField({
  label,
  error,
  hint,
  success,
  inputClassName,
  suffix,
  action,
  required,
  ...input
}: TextFieldProps) {
  const id = useId()
  const messageId = `${id}-message`

  return (
    <div className={styles.field} data-success={success || undefined}>
      <label
        className={
          required ? `${styles.label} ${styles.required}` : styles.label
        }
        htmlFor={id}
      >
        {label}
      </label>
      <div className={styles.control}>
        <div className={styles.inputWrap}>
          <input
            aria-describedby={error || hint ? messageId : undefined}
            aria-invalid={error ? true : undefined}
            aria-required={required || undefined}
            className={
              inputClassName
                ? `${styles.input} ${inputClassName}`
                : styles.input
            }
            id={id}
            {...input}
          />
          {suffix && <span className={styles.suffix}>{suffix}</span>}
        </div>
        {action}
      </div>
      {error ? (
        <p className={styles.error} id={messageId} role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p className={styles.hint} id={messageId}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}
