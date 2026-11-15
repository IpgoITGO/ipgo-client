import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { useCalculation } from '../../../shared/api/calculationContext'
import { errorText } from '../../../shared/api/client'
import { Button } from '../../../shared/ui/Button/Button'
import { Modal } from '../../../shared/ui/Modal/Modal'
import { createPlannedReceipt } from '../../settings/model/plannedReceiptsApi'
import styles from './RegisterOrders.module.css'

export type OrderLine = {
  id: string
  name: string
  quantity: number
  leadTime: number | null
}

/** 오늘 + 리드타임(일) → "2026-11-21". 리드타임을 모르면 도착일 미정(null) */
export function arrivalOn(leadTime: number | null, now = new Date()) {
  if (leadTime == null) return null
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  day.setDate(day.getDate() + leadTime)
  return day.toLocaleDateString('sv')
}

const monthDay = (iso: string) => {
  const [, month, day] = iso.split('-').map(Number)
  return `${month}/${day}`
}

// 엑셀로 받은 발주 목록을 "이미 발주한 물량"으로 바로 등록한다(11/15).
// 전에는 엑셀을 받고 입고 조건 화면에서 같은 수량을 다시 넣어야 다음 계산에서 빠졌다.
// 도착 예정일은 오늘 + 리드타임. 바꾸려면 입고 조건 → 이미 발주한 물량에서.
export function RegisterOrders({
  lines,
  onClose,
  onDone,
}: {
  lines: OrderLine[]
  onClose: () => void
  onDone: (count: number) => void
}) {
  const titleId = useId()
  const queryClient = useQueryClient()
  const { trackRun } = useCalculation()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dated = lines.filter((line) => line.leadTime != null).length

  async function register() {
    setSaving(true)
    setError(null)
    let done = 0
    try {
      let runId: number | null = null
      // 하나씩 차례로: 서버가 등록마다 다시 계산을 시작하므로 마지막 계산만 따라간다
      for (const line of lines) {
        const saved = await createPlannedReceipt({
          productId: Number(line.id),
          quantity: line.quantity,
          expectedOn: arrivalOn(line.leadTime),
        })
        runId = saved.runId ?? runId
        done += 1
      }
      trackRun(runId)
      await queryClient.invalidateQueries({ queryKey: ['planned-receipts'] })
      onDone(done)
    } catch (caught) {
      // 중간에 멈췄으면 몇 건까지 들어갔는지 알려 준다(다시 누르면 겹쳐 들어가므로)
      if (done > 0)
        await queryClient.invalidateQueries({ queryKey: ['planned-receipts'] })
      setError(
        done > 0
          ? `${done}건은 등록했고 나머지는 못 했어요. ${errorText(caught)}`
          : errorText(caught),
      )
      setSaving(false)
    }
  }

  return (
    <Modal labelledBy={titleId} onClose={saving ? () => undefined : onClose}>
      <div className={styles.body}>
        <h2 id={titleId}>발주한 물량으로 등록할까요?</h2>
        <p className={styles.sub}>
          등록하면 다음 계산부터 이 수량만큼 빼고 계산해요. 도착 예정일은 오늘 +
          리드타임으로 넣어요.
        </p>
        <ul className={styles.lines}>
          {lines.map((line) => {
            const on = arrivalOn(line.leadTime)
            return (
              <li key={line.id}>
                <b>{line.name}</b>
                <span className={styles.qty}>
                  {line.quantity.toLocaleString()}개
                </span>
                <span className={styles.when} data-none={on ? undefined : ''}>
                  {on ? `${monthDay(on)} 도착 예정` : '도착일 미정'}
                </span>
              </li>
            )
          })}
        </ul>
        {dated < lines.length && (
          <p className={styles.note}>
            도착일 미정인 상품은 저장만 되고 계산에는 안 들어가요. 입고 조건의
            "이미 발주한 물량"에서 날짜를 넣어 주세요.
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button disabled={saving} onClick={onClose} variant="secondary">
            {error ? '닫기' : '취소'}
          </Button>
          {!error && (
            <Button
              loading={saving}
              loadingLabel="등록하는 중"
              onClick={() => void register()}
            >
              {lines.length}건 등록
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
