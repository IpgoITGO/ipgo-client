import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

import styles from './Button.module.css'

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean
    loadingLabel?: string
    variant?: 'primary' | 'secondary' | 'strong' | 'text'
  }
>

export function Button({
  children,
  className,
  disabled,
  loading = false,
  loadingLabel = '처리 중',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const classes = [styles.button, styles[variant], className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      aria-busy={loading || undefined}
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span aria-hidden="true" className={styles.spinner} />}
      {loading ? loadingLabel : children}
    </button>
  )
}
