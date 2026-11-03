import styles from './BoxLoader.module.css'

// 불러오는 동안: 조각이 상자로 떨어지고 문서의 줄이 하나씩 채워진다.
// done: 같은 자리에서 문서가 상자로 들어가고, 상자가 가운데로 오고, 초록 고리와 체크가 그려진다(1.4초).
// 화면 읽기에는 숨긴다(안내 문구는 쓰는 쪽이 따로 읽힌다).
export function BoxLoader({
  done = false,
  title,
}: {
  done?: boolean
  title: string
}) {
  return (
    <div aria-hidden="true" className={styles.stage}>
      <div
        className={`${styles.scene} ${done ? styles.done : styles.rowsFill}`}
      >
        <div className={styles.chute}>
          {[0, 1, 2, 3, 4].map((slip) => (
            <i className={styles.slip} key={slip} />
          ))}
        </div>
        <div className={styles.box}>
          <img alt="" height="72" src="/logo.png" width="72" />
        </div>
        <div className={styles.pos}>
          <div className={styles.sheet}>
            <div className={styles.sheetHead}>
              <i />
              <b>{title}</b>
            </div>
            <div className={styles.cols}>
              <span>상품</span>
              <span>입고</span>
              <span>출고</span>
              <span>재고</span>
            </div>
            {/* 줄은 한 묶음 안에 둔다. 제목줄·열 이름이 같은 층에 있으면 줄 번호가 밀린다 */}
            <div>
              {[0, 1, 2, 3, 4].map((row) => (
                <div className={styles.row} key={row}>
                  <span className={styles.name} />
                  <span className={styles.num} />
                  <span className={styles.num} />
                  <span className={styles.num} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <svg className={styles.ring} viewBox="0 0 104 104">
          <circle className={styles.ringLine} cx="52" cy="52" r="48" />
        </svg>
        <div className={styles.badge}>
          <svg viewBox="0 0 28 28">
            <path className={styles.check} d="M5 15 l6 6 l12 -14" />
          </svg>
        </div>
      </div>
    </div>
  )
}
