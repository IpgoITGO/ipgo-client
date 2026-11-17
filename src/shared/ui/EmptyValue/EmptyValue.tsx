import styles from './EmptyValue.module.css'

// 서버가 값을 비워 보냈을 때 "—"나 0 대신 왜 비었는지 꼬리표로 보여 준다.
// unset = 미입력 · short = 자료 부족 · unevaluated = 아직 평가하지 않은 값
const LABEL = {
  unset: '미입력',
  short: '자료 부족',
  unevaluated: '미평가',
} as const

export function EmptyValue({ kind }: { kind: keyof typeof LABEL }) {
  return (
    <span className={styles.tag} data-kind={kind}>
      {LABEL[kind]}
    </span>
  )
}
