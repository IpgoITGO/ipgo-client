import { PASSWORD_CHECKS } from '../model/passwordRule'
import styles from './PasswordStrength.module.css'

const LABELS = {
  '8~16자': '8~16자',
  대문자: '영문 대문자 1개 이상',
  소문자: '영문 소문자 1개 이상',
  숫자: '숫자 1개 이상',
  특수문자: '특수문자 1개 이상',
} as const

// 조건 5줄을 처음부터 늘 보여 준다(칸 밀림 없음). 빈칸: 회색 점 · 채움: 초록 ✓ · 아직: 빨강 ✕
export function PasswordStrength({ value }: { value: string }) {
  return (
    <ul
      aria-label="비밀번호 조건"
      className={styles.list}
      data-empty={value === '' || undefined}
    >
      {PASSWORD_CHECKS.map((check) => {
        const met = check.test(value)
        return (
          <li data-met={met || undefined} key={check.label}>
            <span className={styles.srOnly}>{met ? '충족: ' : '미충족: '}</span>
            {LABELS[check.label]}
          </li>
        )
      })}
    </ul>
  )
}
