import styles from './DashboardSkeleton.module.css'

const ROW_WIDTHS = ['100%', '80%', '65%', '72%']

// 계산 중 대시보드 자리: 제목·칩 2개·상자 4개·표 4줄이 실제 화면과 같은 배치.
export function DashboardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className={styles.root}
      data-testid="dashboard-skeleton"
    >
      <span className={`${styles.sk} ${styles.title}`} />
      <div className={styles.chips}>
        <span className={styles.sk} />
        <span className={styles.sk} />
      </div>
      <div className={styles.boxes}>
        {[0, 1, 2, 3].map((i) => (
          <div className={styles.box} key={i}>
            <span className={`${styles.sk} ${styles.a}`} />
            <span className={`${styles.sk} ${styles.b}`} />
            <span className={`${styles.sk} ${styles.c}`} />
          </div>
        ))}
      </div>
      <div className={styles.panel}>
        <span className={`${styles.sk} ${styles.h}`} />
        {ROW_WIDTHS.map((w) => (
          <div className={styles.row} key={w}>
            <span className={`${styles.sk} ${styles.ck}`} />
            <span className={styles.sk} style={{ width: w }} />
            {[0, 1, 2, 3, 4].map((i) => (
              <span className={styles.sk} key={i} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
