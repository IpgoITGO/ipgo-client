import { useEffect, useState } from 'react'

import { Button } from '../../../shared/ui/Button/Button'
import styles from './UploadProcessing.module.css'

// 처리가 이 시간을 넘기면 "창을 닫아도 처리는 계속돼요" 안내를 붙인다.
export const LONG_WAIT_SECONDS = 120

// 끝난 순간 연출 길이. 화면 쪽 타이머와 CSS 애니메이션 길이(1.4s)에 여유를 더해 맞춘다.
export const FINISH_MS = 1500

function Sheet() {
  return (
    <div className={styles.sheet}>
      <div className={styles.sheetHead}>
        <i />
        <b>수불부</b>
      </div>
      <div className={styles.cols}>
        <span>상품</span>
        <span>입고</span>
        <span>출고</span>
        <span>재고</span>
      </div>
      {[0, 1, 2, 3, 4].map((row) => (
        <div className={styles.row} key={row}>
          <span className={styles.name} />
          <span className={styles.num} />
          <span className={styles.num} />
          <span className={styles.num} />
        </div>
      ))}
    </div>
  )
}

function formatElapsed(seconds: number) {
  return `${Math.floor(seconds / 60)}분 ${seconds % 60}초째`
}

// 한 장면으로 이어진다.
// 확인 중: 수불부 조각이 상자로 떨어지고 문서의 줄이 하나씩 채워진다.
// 끝나면(done): 같은 자리에서 문서가 상자로 들어가고, 상자가 가운데로 오고, 초록 고리와 체크가 그려진다.
export function UploadProcessing({
  done = false,
  onGoDashboard,
}: {
  done?: boolean
  onGoDashboard: () => void
}) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (done) return
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [done])

  const isLong = !done && seconds >= LONG_WAIT_SECONDS

  return (
    <section aria-live="polite" className={styles.container} role="status">
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
            <Sheet />
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
      <h2
        className={done ? styles.fade : undefined}
        key={done ? 'done' : 'wait'}
      >
        {done ? '수불부 확인을 마쳤어요' : '수불부를 확인하고 있어요'}
      </h2>
      <p className={done ? styles.fade : undefined} key={done ? 'd2' : 'w2'}>
        {done
          ? '결과를 정리했어요.'
          : '수불부 형식과 재고 숫자를 확인하고 있어요.'}
      </p>
      {isLong && (
        <div className={styles.band}>
          <span aria-hidden="true" className={styles.bandDot} />
          <strong>생각보다 오래 걸려요</strong>
          {/* 1초마다 바뀌는 시간은 화면 읽기에서 뺀다. 안내는 한 번만 읽힌다. */}
          <time aria-hidden="true">{formatElapsed(seconds)}</time>
          <p>창을 닫아도 처리는 계속돼요. 끝나면 대시보드에서 볼 수 있어요.</p>
          <Button onClick={onGoDashboard} variant="secondary">
            대시보드로
          </Button>
        </div>
      )}
    </section>
  )
}
