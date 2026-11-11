import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useId, useState } from 'react'

import { Button } from '../../../shared/ui/Button/Button'
import { Modal } from '../../../shared/ui/Modal/Modal'
import { monthDayKo } from '../../billing/model/billing'
import { getDashboard } from '../../dashboard/model/dashboardApi'
import pauseArt from '../assets/cancel-pause.webp'
import styles from './CancelModal.module.css'

const REASONS = [
  '가격이 부담돼요',
  '생각보다 잘 안 써요',
  '예측이 잘 안 맞아요',
  '다른 서비스를 쓸래요',
  '기타',
]
export const REASONS_KEY = 'ipgo:cancel-reasons'

// 계산 결과가 없을 때(불러오는 중·실패·빈 목록) 보여 줄 예시. 실제 상품처럼 보이지 않게 이름은 상품 A·B·C, 그림마다 "예시" 표시
const SAMPLE_ROWS = [
  { name: '상품 A', qty: 60 },
  { name: '상품 B', qty: 60 },
  { name: '상품 C', qty: 40 },
]

// "2026. 11. 2" → "11/2" (없으면 undefined)
function shortDate(dot: string | undefined) {
  const m = dot?.match(/(\d+)\.\s*(\d+)\.\s*(\d+)/)
  return m ? `${Number(m[2])}/${Number(m[3])}` : undefined
}

function Lock({ label }: { label: string }) {
  return (
    <div className={styles.lockc}>
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="#5c6370" />
        <path
          d="M8 10.5V8a4 4 0 0 1 8 0v2.5"
          fill="none"
          stroke="#5c6370"
          strokeWidth="2"
        />
      </svg>
      <b>{label}</b>
    </div>
  )
}

function Split({
  now,
  after,
  afterAt,
  pill,
  example,
}: {
  now: ReactNode
  after: ReactNode
  afterAt: string
  pill: string
  example: boolean
}) {
  return (
    <div aria-hidden="true" className={styles.split}>
      <div>
        <span className={styles.cap}>{example ? '지금 · 예시' : '지금'}</span>
        <div className={styles.inner}>{now}</div>
      </div>
      <div className={styles.after}>
        <span className={styles.cap}>{afterAt} 이후</span>
        <div className={`${styles.inner} ${styles.dim}`}>{after}</div>
        <Lock label={pill} />
      </div>
    </div>
  )
}

function Sheet({
  rows,
  filled,
}: {
  rows: Array<{ name: string; qty: number }>
  filled: boolean
}) {
  return (
    <div className={styles.xl}>
      <div className={styles.xbar}>▦ 발주목록.xlsx</div>
      <table>
        <tbody>
          <tr>
            <th>상품</th>
            <th>주문</th>
          </tr>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              {filled ? <td className={styles.hl}>{row.qty}</td> : <td />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type Props = {
  /** 다음 결제일(YYYY-MM-DD). 이날부터 해지가 적용된다 */
  nextOn: string
  onClose: () => void
  onCancel: () => void
}

export function CancelModal({ nextOn, onClose, onCancel }: Props) {
  const titleId = useId()
  const [step, setStep] = useState<1 | 2>(1)
  const [picked, setPicked] = useState<string[]>([])
  // 대시보드와 같은 키라 이미 받아 둔 값이 있으면 다시 요청하지 않는다
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    staleTime: Infinity,
  })

  const [, m, d] = nextOn.split('-').map(Number)
  const day = `${m}/${d}`
  const top = data?.neededItems[0]
  const example = !top
  const name = top?.name ?? '상품 A'
  const qty = top?.quantity ?? 72
  // 실제 상품의 위험이 아직 없으면(null) 숫자를 지어내지 않고 "—"
  const risk = top ? top.risk : 9
  const gone = shortDate(top?.stockoutDate) ?? (example ? '11/2' : '—')
  const rows = data?.neededItems.length
    ? data.neededItems
        .slice(0, 3)
        .map((item) => ({ name: item.name, qty: item.quantity }))
    : SAMPLE_ROWS

  function toggle(reason: string) {
    setPicked((now) =>
      now.includes(reason) ? now.filter((r) => r !== reason) : [...now, reason],
    )
  }

  function confirm() {
    // ponytail: 서버 저장은 ipgo-server#110, 그 전엔 이 브라우저에만 남긴다
    try {
      localStorage.setItem(REASONS_KEY, JSON.stringify(picked))
    } catch {
      /* 저장이 막혀도 해지는 진행 */
    }
    onCancel()
    onClose()
  }

  return (
    <Modal labelledBy={titleId} onClose={onClose}>
      {step === 1 ? (
        <div className={styles.body}>
          <div className={styles.hd}>
            <img alt="" src={pauseArt} />
          </div>
          <h2 className={styles.title} id={titleId}>
            해지하면 {monthDayKo(nextOn)}부터 이걸 놓쳐요
          </h2>
          {example && (
            <p className={styles.exampleNote}>
              아직 계산 결과가 없어 아래 그림은 예시예요
            </p>
          )}

          <div className={styles.loss}>
            <b>권장 입고량 해지</b>
            <Split
              afterAt={day}
              example={example}
              now={
                <div className={styles.r}>
                  <span className={styles.nm}>
                    {name} <span className={styles.stamp}>품절 주의</span>
                  </span>
                  <span className={styles.dt}>{gone} 바닥</span>
                  <span className={styles.q}>{qty}개</span>
                  <span className={styles.k}>권장 입고량</span>
                </div>
              }
              after={
                <div className={styles.r}>
                  <span className={styles.nm}>{name}</span>
                  <span className={styles.dt}>?</span>
                  <span className={styles.q}>—</span>
                  <span className={styles.k}>권장 입고량</span>
                </div>
              }
              pill="계산 멈춤"
            />
          </div>

          <div className={styles.loss}>
            <b>품절 위험 해지</b>
            <Split
              afterAt={day}
              example={example}
              now={
                <div>
                  <span className={styles.k}>품절 위험</span>
                  <span className={styles.big}>
                    {risk == null ? '—' : `${risk}%`}
                  </span>
                  <span className={styles.track}>
                    <i style={{ width: `${Math.min(risk ?? 0, 100)}%` }} />
                  </span>
                </div>
              }
              after={<span className={styles.k}>품절 위험</span>}
              pill="안 보여요"
            />
          </div>

          <div className={styles.loss}>
            <b>발주 목록 엑셀 해지</b>
            <Split
              afterAt={day}
              example={example}
              now={<Sheet filled rows={rows} />}
              after={<Sheet filled={false} rows={rows} />}
              pill="받기 안 됨"
            />
          </div>

          <div className={styles.actions}>
            <Button autoFocus className={styles.wide} onClick={onClose}>
              그대로 쓸게요
            </Button>
            <button
              className={styles.link}
              onClick={() => setStep(2)}
              type="button"
            >
              그래도 해지할래요
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.hd2}>
            <div className={styles.cal}>
              <div className={styles.day}>
                <span>{m}월</span>
                <b>{d}</b>
              </div>
              <div className={styles.calText}>
                이날까지는
                <br />
                <b>지금처럼 써요</b>
              </div>
            </div>
          </div>
          <h2 className={styles.title} id={titleId}>
            정말 해지할까요?
          </h2>
          <p className={styles.lead}>
            {monthDayKo(nextOn)}에 끝나요. 그 전에는 내 계정에서 해지를 취소할
            수 있어요.
          </p>
          <fieldset className={styles.reasons}>
            <legend>해지하는 이유 (여러 개 골라도 돼요)</legend>
            {REASONS.map((reason) => (
              <label
                className={picked.includes(reason) ? styles.on : undefined}
                key={reason}
              >
                <input
                  checked={picked.includes(reason)}
                  onChange={() => toggle(reason)}
                  type="checkbox"
                />
                {reason}
              </label>
            ))}
          </fieldset>
          <div className={styles.actions}>
            <Button autoFocus className={styles.wide} onClick={onClose}>
              그대로 쓸게요
            </Button>
            <Button
              className={styles.wide}
              onClick={confirm}
              variant="secondary"
            >
              해지하기
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
