import {
  hasInvalidPasswordChar,
  PASSWORD_CHECKS,
  PASSWORD_RULE_HINT,
} from '../model/passwordRule'
import styles from './PasswordStrength.module.css'

const LENGTH = PASSWORD_CHECKS[0].label

function message(value: string, missing: string[]) {
  const kinds = missing.filter((label) => label !== LENGTH)
  return [
    kinds.length > 0 && `${kinds.join('·')}를 넣어 주세요.`,
    missing.includes(LENGTH) &&
      (value.length > 16
        ? '16자까지 쓸 수 있어요.'
        : '8자 이상으로 해 주세요.'),
  ]
    .filter(Boolean)
    .join(' ')
}

// 규칙 5가지 중 채운 개수만큼 선이 차고, 빠진 조건만 알려 준다.
export function PasswordStrength({ value }: { value: string }) {
  if (value === '') return <>{PASSWORD_RULE_HINT}</>

  const missing = PASSWORD_CHECKS.filter((check) => !check.test(value))
  const met = PASSWORD_CHECKS.length - missing.length
  const level = met === PASSWORD_CHECKS.length ? 'ok' : met >= 3 ? 'mid' : 'low'
  const invalid = hasInvalidPasswordChar(value)

  return (
    <span className={styles.wrap} data-level={invalid ? 'low' : level}>
      <span
        aria-label={`비밀번호 조건 ${PASSWORD_CHECKS.length}개 중 ${met}개 충족`}
        className={styles.bar}
        role="img"
      >
        {PASSWORD_CHECKS.map((check, index) => (
          <i data-on={index < met || undefined} key={check.label} />
        ))}
      </span>
      <span aria-live="polite" className={styles.text}>
        {invalid
          ? '공백·한글은 쓸 수 없어요.'
          : missing.length === 0
            ? '쓸 수 있는 비밀번호예요.'
            : message(
                value,
                missing.map((check) => check.label),
              )}
      </span>
    </span>
  )
}
