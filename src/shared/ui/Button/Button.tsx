import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

import styles from './Button.module.css'

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary'
  }
>

export function Button({
  children,
  className,
  variant = 'primary',
  ...props
}: ButtonProps) {
  const classes = [styles.button, styles[variant], className]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  )
}
