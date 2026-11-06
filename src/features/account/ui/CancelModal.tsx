import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useId, useState } from 'react'

import { Button } from '../../../shared/ui/Button/Button'
import { Modal } from '../../../shared/ui/Modal/Modal'
import { monthDayKo } from '../../billing/model/billing'
import { getDashboard } from '../../dashboard/model/dashboardApi'
import styles from './CancelModal.module.css'

const REASONS = [
  '가격이 부담돼요',
  '생각보다 잘 안 써요',
  '예측이 잘 안 맞아요',
  '다른 서비스를 쓸래요',
  '기타',
]
export const REASONS_KEY = 'ipgo:cancel-reasons'

// 데이터가 없을 때 보여 줄 예시 값(시안과 같다)
const SAMPLE_ROWS = [
  { name: '케어트릿', qty: 60 },
  { name: '덴탈껌 S', qty: 60 },
  { name: '연어 져키', qty: 40 },
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
}: {
  now: ReactNode
  after: ReactNode
  afterAt: string
  pill: string
}) {
  return (
    <div aria-hidden="true" className={styles.split}>
      <div>
        <span className={styles.cap}>지금</span>
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
  const name = top?.name ?? '케어트릿 120g'
  const qty = top?.quantity ?? 72
  const risk = top?.risk ?? 9
  const gone = shortDate(top?.stockoutDate) ?? '11/2'
  const needed = data?.summary.needed ?? 6
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
            <svg
              aria-hidden="true"
              preserveAspectRatio="xMidYMid slice"
              viewBox="0 0 460 150"
            >
              <defs>
                <linearGradient id="cm-f1" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#f6c766" />
                  <stop offset="1" stopColor="#e6a33a" />
                </linearGradient>
                <linearGradient id="cm-f2" x1="0" x2="1">
                  <stop offset="0" stopColor="#e8ac4d" />
                  <stop offset="1" stopColor="#d48d28" />
                </linearGradient>
                <linearGradient id="cm-f3" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#fbd98f" />
                  <stop offset="1" stopColor="#f0bd5c" />
                </linearGradient>
                <pattern
                  id="cm-dots"
                  width="14"
                  height="14"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="2" cy="2" r="1.2" fill="#f0dfae" />
                </pattern>
              </defs>
              <rect width="460" height="150" fill="url(#cm-dots)" />
              <path
                d="M0 130 Q230 112 460 130 L460 150 L0 150 Z"
                fill="#f3e6c6"
              />
              <ellipse
                cx="230"
                cy="136"
                rx="92"
                ry="8"
                fill="#e3cf9f"
                opacity=".8"
              />
              <path
                d="M158 70 L230 46 L302 70 L302 122 L230 140 L158 122 Z"
                fill="url(#cm-f1)"
                stroke="#a8641a"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <path
                d="M230 94 L302 70 L302 122 L230 140 Z"
                fill="url(#cm-f2)"
                stroke="#a8641a"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <path
                d="M158 70 L230 94 L302 70 L230 46 Z"
                fill="url(#cm-f3)"
                stroke="#a8641a"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <path
                d="M194 58 L266 82"
                stroke="#a8641a"
                strokeWidth="1.6"
                opacity=".55"
              />
              {/* 포장 테이프: 윗면 이음매를 따라 붙고 앞면 모서리에서 꺾여 내려와 끝이 찢겨 있다 */}
              <g className={styles.tape}>
                <path
                  d="M182 62 L206 54 L278 78 L254 86 Z"
                  fill="#ffc53d"
                  opacity=".9"
                />
                <path
                  d="M254 86 L278 78 L278 92 L274 92.6 L271 95.4 L267 95.3 L263 98 L259 97.9 L254 101 Z"
                  fill="#f0ad1f"
                  opacity=".92"
                />
                <path
                  d="M190 61.3 L262 85.3"
                  stroke="#fff6cf"
                  strokeLinecap="round"
                  strokeWidth="2.4"
                  opacity=".7"
                />
                <path
                  d="M182 62 L206 54 M216 64 l3 4 M240 72 l2 3"
                  stroke="#c98a12"
                  strokeLinecap="round"
                  strokeWidth="1"
                  opacity=".6"
                />
                <text
                  x="230"
                  y="74"
                  textAnchor="middle"
                  transform="rotate(18.4 230 70)"
                  fontFamily="Nanum Pen Script"
                  fontSize="13"
                  fill="#6b3d00"
                >
                  {day}부터 계산 멈춤
                </text>
              </g>
              <g transform="translate(236 114) skewY(-17)">
                <rect
                  width="32"
                  height="17"
                  rx="3"
                  fill="#fff"
                  stroke="#a8641a"
                  strokeWidth="1.2"
                />
                <text
                  x="16"
                  y="12"
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight="800"
                  fill="#1f2537"
                >
                  ITGO
                </text>
              </g>
              <text
                x="40"
                y="44"
                fontFamily="Nanum Pen Script"
                fontSize="22"
                fill="#8a5200"
              >
                여기서 멈추면…
              </text>
              <g transform="translate(300 30)">
                <rect
                  width="146"
                  height="30"
                  rx="15"
                  fill="#fff"
                  stroke="#efd99c"
                />
                <text
                  x="73"
                  y="19.5"
                  textAnchor="middle"
                  fontSize="11"
                  fill="#5c6370"
                >
                  지금 넣어야 할 상품{' '}
                  <tspan fill="#1f2537" fontSize="13" fontWeight="800">
                    {needed}개
                  </tspan>
                </text>
              </g>
            </svg>
          </div>
          <h2 className={styles.title} id={titleId}>
            해지하면 {monthDayKo(nextOn)}부터
            <br />
            이걸 놓쳐요
          </h2>

          <div className={styles.loss}>
            <b>권장 입고량 해지</b>
            <Split
              afterAt={day}
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
              now={
                <div>
                  <span className={styles.k}>품절 위험</span>
                  <span className={styles.big}>{risk}%</span>
                  <span className={styles.track}>
                    <i style={{ width: `${Math.min(risk, 100)}%` }} />
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
