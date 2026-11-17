import styles from './CalcMark.module.css'

// 계산 상태 띠 앞 표시. 업로드 상자 연출(BoxLoader)의 작은 판.
// running: 수불부 조각이 로고 상자로 떨어짐 · done: 튀고 → 초록 고리 → 체크 배지(한 번) · failed: 빨간 ! 배지
export function CalcMark({
  bare,
  state,
}: {
  /** 회색 받침 없이 상자만(큰 안내 상자 가운데에 둘 때) */
  bare?: boolean
  state: 'running' | 'done' | 'failed'
}) {
  return (
    <span
      aria-hidden="true"
      className={styles.mark}
      data-bare={bare || undefined}
      data-state={state}
    >
      <span className={styles.dock}>
        <span className={styles.chute}>
          <i />
          <i />
        </span>
        <img alt="" height="32" src="/logo.png" width="32" />
      </span>
      <svg className={styles.ring} viewBox="0 0 58 58">
        <circle cx="29" cy="29" r="27" />
      </svg>
      <span className={styles.badge}>
        {state === 'done' ? (
          <svg viewBox="0 0 12 12">
            <path d="M2.5 6.3l2.2 2.2 4.6-4.9" />
          </svg>
        ) : (
          '!'
        )}
      </span>
    </span>
  )
}
