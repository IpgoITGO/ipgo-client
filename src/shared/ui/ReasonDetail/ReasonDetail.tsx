import { calculationReasonDetail } from '../../lib/calculationReason'
import styles from './ReasonDetail.module.css'

// "최근 28일 판매한 날 5일 · 7일 필요" → 이름·가진 날·필요한 날로 나눠 칸으로 보여 준다
const ROW = /^(.+?) 판매한 날 (\d+)일 · (\d+)일 필요$/
// "2025-11-01" → "11/1" (작년·최근은 이름에 이미 들어 있다)
const shortDay = (text: string) =>
  text.replace(/\d{4}-(\d{2})-(\d{2})/g, (_, m, d) => `${+m}/${+d}`)

// "자세한 계산 사유" 펼침. 엔진 문장 대신 기간마다 판매한 날을 칸으로 채워 보여 준다. 풀 게 없으면 그리지 않는다.
export function ReasonDetail({ reason }: { reason: string }) {
  const lines = calculationReasonDetail(reason)
  if (!lines) return null
  return (
    <details className={styles.detail}>
      <summary>자세한 계산 사유</summary>
      <ul className={styles.rows}>
        {lines.map((line) => {
          const row = ROW.exec(line)
          if (!row) return <li key={line}>{line}</li>
          const [, name, have, need] = row
          const filled = Math.min(Number(have), Number(need))
          return (
            <li key={line}>
              <span className={styles.name}>{shortDay(name)}</span>
              <span
                aria-label={`판매한 날 ${have}일, ${need}일 필요`}
                className={styles.cells}
                role="img"
              >
                {Array.from({ length: Number(need) }, (_, i) => (
                  <i data-on={i < filled} key={i} />
                ))}
              </span>
              <span className={styles.count}>
                <b>{have}</b> / {need}일
              </span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
