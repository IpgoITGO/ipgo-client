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
  hintEnd?: ReactNode // 안내 줄 오른쪽 끝(다시 보내기 등). 안내 글과 한 줄에 양 끝으로 놓인다
  boxes?: number // 자릿수만큼 칸으로 보여 주기(인증 코드 6자리). value를 꼭 같이 준다
}

export function TextField({
  label,
  error,
  hint,
  success,
  inputClassName,
  suffix,
  action,
  boxes,
  hintEnd,
  required,
  ...input
}: TextFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

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
        <div className={styles.inputWrap} data-boxes={boxes ? '' : undefined}>
          {/* 인증 코드처럼 자릿수가 정해진 값은 칸으로 보여 준다(11/17). 입력은 그 위의 투명한 입력칸 하나가 받는다(붙여 넣기·자동 완성 그대로) */}
          {boxes && (
            <span aria-hidden="true" className={styles.boxes}>
              {Array.from({ length: boxes }, (_, index) => {
                const text = String(input.value ?? '')
                return (
                  <i
                    data-at={
                      index === Math.min(text.length, boxes - 1) || undefined
                    }
                    data-filled={text[index] ? '' : undefined}
                    key={index}
                  >
                    {text[index]}
                  </i>
                )
              })}
            </span>
          )}
          <input
            aria-describedby={
              [error && errorId, hint && hintId].filter(Boolean).join(' ') ||
              undefined
            }
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
      {/* 오류가 있어도 안내 줄은 남겨 둡니다. 다시 보내기 같은 버튼이 안내 줄에 있습니다. */}
      {error && (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      )}
      {hint && (
        <div
          className={styles.hint}
          data-split={hintEnd ? '' : undefined}
          id={hintId}
        >
          {hintEnd ? (
            <>
              <span>{hint}</span>
              {hintEnd}
            </>
          ) : (
            hint
          )}
        </div>
      )}
    </div>
  )
}
