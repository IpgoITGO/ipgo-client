import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'

import { BoxLoader } from '../../../shared/ui/BoxLoader/BoxLoader'
import { Button } from '../../../shared/ui/Button/Button'
import { Modal } from '../../../shared/ui/Modal/Modal'
import styles from './UploadProcessing.module.css'

// 처리가 이 시간을 넘기면 "창을 닫아도 처리는 계속돼요" 안내를 붙인다.
export const LONG_WAIT_SECONDS = 120

// 끝난 순간 연출 길이. 화면 쪽 타이머와 CSS 애니메이션 길이(1.4s)에 여유를 더해 맞춘다.
export const FINISH_MS = 1500

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
  // 안내 띠의 "대시보드로" 버튼은 스스로 나가는 거라 확인 없이 보낸다.
  const leavingOnPurpose = useRef(false)
  // 처리 중에 뒤로 가기·다른 메뉴로 나가려 하면 한 번 묻는다.
  const blocker = useBlocker(() => !done && !leavingOnPurpose.current)

  useEffect(() => {
    if (done) return
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [done])

  // 팝업이 떠 있는 사이에 처리가 끝나면 나가지 않고 끝난 장면을 보여 준다.
  useEffect(() => {
    if (done && blocker.state === 'blocked') blocker.reset()
  }, [blocker, done])

  const isLong = !done && seconds >= LONG_WAIT_SECONDS

  return (
    <section aria-live="polite" className={styles.container} role="status">
      <BoxLoader done={done} title="수불부" />
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
          <Button
            onClick={() => {
              leavingOnPurpose.current = true
              onGoDashboard()
            }}
            variant="secondary"
          >
            대시보드로
          </Button>
        </div>
      )}
      {blocker.state === 'blocked' && (
        <Modal labelledBy="leave-title" onClose={() => blocker.reset()}>
          <div className={styles.leave}>
            <h2 id="leave-title">수불부를 확인하는 중이에요</h2>
            <p>
              지금 나가도 처리는 계속돼요. 끝나면 대시보드에서 결과를 볼 수
              있어요.
            </p>
            <div className={styles.leaveActions}>
              <Button onClick={() => blocker.proceed()} variant="secondary">
                나가기
              </Button>
              <Button onClick={() => blocker.reset()}>계속 기다리기</Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}
