import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { Button } from '../../../shared/ui/Button/Button'
import { Modal } from '../../../shared/ui/Modal/Modal'
import { monthDayKo } from '../../billing/model/billing'
import type {
  CancellationFeedback,
  CancellationReason,
} from '../../billing/model/billingApi'
import { getDashboard } from '../../dashboard/model/dashboardApi'
import pauseArt from '../assets/cancel-pause.webp'
import styles from './CancelModal.module.css'

const REASONS = [
  { code: 'PRICE', label: '가격이 부담돼요' },
  { code: 'NOT_USING', label: '생각보다 잘 안 써요' },
  { code: 'PREDICTION_QUALITY', label: '예측이 잘 안 맞아요' },
  { code: 'OTHER_SERVICE', label: '다른 서비스를 쓸래요' },
  { code: 'OTHER', label: '기타' },
] as const

// 계산 결과가 없을 때(불러오는 중·실패·빈 목록) 보여 줄 예시. 실제 상품처럼 보이지 않게 이름은 상품 A·B·C, 그림마다 "예시" 표시
const SAMPLE_ROWS = [
  { name: '상품 A', qty: 60 },
  { name: '상품 B', qty: 60 },
  { name: '상품 C', qty: 40 },
]

type Props = {
  /** 다음 결제일(YYYY-MM-DD). 이날부터 해지가 적용된다 */
  nextOn: string
  onClose: () => void
  onCancel: (feedback: CancellationFeedback) => void
}

export function CancelModal({ nextOn, onClose, onCancel }: Props) {
  const titleId = useId()
  const [step, setStep] = useState<1 | 2>(1)
  const [picked, setPicked] = useState<CancellationReason[]>([])
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
  const rows = data?.neededItems.length
    ? data.neededItems
        .slice(0, 3)
        .map((item) => ({ name: item.name, qty: item.quantity }))
    : SAMPLE_ROWS

  function toggle(reason: CancellationReason) {
    setPicked((now) =>
      now.includes(reason) ? now.filter((r) => r !== reason) : [...now, reason],
    )
  }

  function confirm() {
    onCancel({ reasons: [...picked].sort() })
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
              아직 계산 결과가 없어 아래 표는 예시예요
            </p>
          )}

          {/* 놓치는 것 세 가지를 표 한 장으로(11/11): 상자·작은 그림 세 개는 여백만 컸다 */}
          <table className={styles.lossTable}>
            <thead>
              <tr>
                <td />
                <th scope="col">{example ? '지금 · 예시' : '지금'}</th>
                <th scope="col">{day} 이후</th>
              </tr>
            </thead>
            <tbody data-rise="">
              <tr>
                <th scope="row">권장 입고량</th>
                <td>
                  <span>{name}</span> <b>{qty}개</b>
                </td>
                <td>계산 멈춤</td>
              </tr>
              <tr>
                <th scope="row">품절 위험</th>
                <td>
                  <b>{risk == null ? '—' : `${risk}%`}</b>
                </td>
                <td>안 보여요</td>
              </tr>
              <tr>
                <th scope="row">발주 목록 엑셀</th>
                <td>
                  <b>상품 {rows.length}개</b>
                </td>
                <td>받기 안 됨</td>
              </tr>
            </tbody>
          </table>

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
            {REASONS.map(({ code: reason, label }) => (
              <label
                className={picked.includes(reason) ? styles.on : undefined}
                key={reason}
              >
                <input
                  checked={picked.includes(reason)}
                  onChange={() => toggle(reason)}
                  type="checkbox"
                />
                {label}
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
