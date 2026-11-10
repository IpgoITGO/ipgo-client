import { zodResolver } from '@hookform/resolvers/zod'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { ApiError, apiRequest } from '../../../shared/api/client'
import type { ReplenishmentNeeds } from '../../dashboard/model/dashboardApi'
import { Button } from '../../../shared/ui/Button/Button'
import { useCalculation } from '../../../shared/api/calculationContext'
import { DatePicker } from '../../../shared/ui/DatePicker/DatePicker'
import { Modal } from '../../../shared/ui/Modal/Modal'
import { Toast } from '../../../shared/ui/Toast/Toast'
import {
  cancelPlannedReceipt,
  createPlannedReceipt,
  getPlannedReceipts,
  getProducts,
  type PlannedReceipt,
  type ReceiptStatus,
  updatePlannedReceipt,
} from '../model/plannedReceiptsApi'
import styles from './PurchaseOrdersSection.module.css'

const orderSchema = z.object({
  productId: z.string().min(1, '상품을 골라 주세요.'),
  quantity: z
    .number()
    .int('1 이상의 정수로 넣어 주세요.')
    .positive('1 이상의 정수로 넣어 주세요.'),
  expectedOn: z.string(),
})

type OrderValues = z.infer<typeof orderSchema>

// 서버 상태 → 화면 글자와 색(CSS data-status)
const statusView: Record<ReceiptStatus, { key: string; label: string }> = {
  PENDING: { key: 'reflecting', label: '계산에 반영 중' },
  RECEIVED: { key: 'arrived', label: '도착 완료 · 입고 확인' },
  OVERDUE: { key: 'overdue', label: '도착일 지남 · 확인 필요' },
  NO_DATE: { key: 'no-date', label: '도착일 없어 반영 안 돼요' },
}

const emptyOrder: OrderValues = { productId: '', quantity: 1, expectedOn: '' }

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
// 2026-12-01 → "12/1 (화)"
function shortDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${m}/${d} (${WEEK[new Date(y, m - 1, d).getDay()]})`
}
function daysPast(iso: string, today: string) {
  return Math.round((Date.parse(today) - Date.parse(iso)) / 864e5)
}
// 확인이 필요한 줄(도착일 지남·미정)을 위로, 도착 완료는 아래로
const statusOrder: Record<ReceiptStatus, number> = {
  OVERDUE: 0,
  NO_DATE: 1,
  PENDING: 2,
  RECEIVED: 3,
}

type ActiveProduct = { productId: number; skuName: string; skuBarcode: string }

// 상품 칸 하나: 치면 바로 아래에 후보가 뜨고, 고르면 이름이 칸에 남는다(11/10 — 검색 칸·고르기 칸 두 개를 하나로).
function ProductCombo({
  query,
  onQuery,
  items,
  recommended,
  pending,
  failed,
  invalid,
  onPick,
}: {
  query: string
  onQuery: (value: string) => void
  items: ActiveProduct[]
  recommended: Map<number, number>
  pending: boolean
  failed: boolean
  invalid?: string
  onPick: (item: ActiveProduct | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const shown = items.slice(0, 8)
  const empty = pending
    ? '상품을 불러오고 있어요'
    : query
      ? '검색 결과가 없어요'
      : '등록된 상품이 없어요'

  function pick(item: ActiveProduct) {
    onPick(item)
    onQuery(item.skuName)
    setOpen(false)
  }

  return (
    <div className={styles.combo}>
      <label htmlFor="po-product">상품</label>
      <input
        aria-activedescendant={
          open && shown[active]
            ? `po-option-${shown[active].productId}`
            : undefined
        }
        aria-autocomplete="list"
        aria-controls="po-product-list"
        aria-expanded={open}
        aria-invalid={Boolean(invalid)}
        autoComplete="off"
        id="po-product"
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onQuery(event.target.value)
          onPick(null)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setActive((index) => Math.min(index + 1, shown.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter' && open && shown[active]) {
            event.preventDefault()
            pick(shown[active])
          } else if (event.key === 'Escape' && open) {
            event.stopPropagation()
            setOpen(false)
          }
        }}
        placeholder="상품명이나 바코드를 쳐 주세요"
        role="combobox"
        type="text"
        value={query}
      />
      {open && (
        <ul className={styles.options} id="po-product-list" role="listbox">
          {shown.length === 0 ? (
            <li
              aria-disabled="true"
              className={styles.optionEmpty}
              role="option"
              aria-selected={false}
            >
              {empty}
            </li>
          ) : (
            shown.map((item, index) => (
              <li
                aria-selected={index === active}
                className={styles.option}
                id={`po-option-${item.productId}`}
                key={item.productId}
                onMouseDown={(event) => {
                  event.preventDefault()
                  pick(item)
                }}
                onMouseEnter={() => setActive(index)}
                role="option"
              >
                <span className={styles.optionName}>
                  <strong>{item.skuName}</strong>
                  <small>{item.skuBarcode}</small>
                </span>
                {recommended.has(item.productId) && (
                  <span className={styles.optionMeta}>
                    권장 {recommended.get(item.productId)!.toLocaleString()}개
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
      {failed && <small role="alert">상품 목록을 불러오지 못했어요.</small>}
      {invalid && <small role="alert">{invalid}</small>}
    </div>
  )
}

export function PurchaseOrdersSection() {
  const { trackRun, busy: calculationBusy } = useCalculation()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  // 수정 중인 발주. null이면 새로 등록한다.
  const [editing, setEditing] = useState<PlannedReceipt | null>(null)
  const [productSearch, setProductSearch] = useState('')
  // 팝업 안 발주 취소는 한 번 더 눌러야 실행한다.
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // 목록 ×로 지운 발주: 우리 앱 알림(위 남색 쪽지)에 되돌리기를 4초(11/10 — 표 위 한 줄은 안 보임)
  const [undo, setUndo] = useState<PlannedReceipt | null>(null)
  const [notice, setNotice] = useState('')
  const today = localToday()

  const receipts = useQuery({
    queryKey: ['planned-receipts'],
    queryFn: getPlannedReceipts,
  })
  // 상품은 새로 등록할 때만 서버에서 찾는다. 판매 중지 상품은 고를 수 없다.
  const products = useQuery({
    queryKey: ['products', productSearch],
    queryFn: () => getProducts(productSearch),
    enabled: isOpen && !editing,
    placeholderData: keepPreviousData,
  })
  // 고를 때 지금 권장 입고량을 옆에 보여 주고 수량에 미리 넣는다
  const needs = useQuery({
    queryKey: ['dashboard', 'recommended'],
    queryFn: () =>
      apiRequest<ReplenishmentNeeds>('/dashboard/replenishment-needs'),
    enabled: isOpen && !editing,
  })
  const recommended = new Map(
    (needs.data?.items ?? []).map((item) => [
      item.productId,
      item.recommendedQty,
    ]),
  )
  const activeProducts = (products.data?.items ?? []).filter(
    (item) => item.isActive,
  )
  const orders = [...(receipts.data?.items ?? [])].sort(
    (a, b) => statusOrder[a.status] - statusOrder[b.status],
  )

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<OrderValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: emptyOrder,
  })

  function openModal(order: PlannedReceipt | null) {
    setEditing(order)
    setProductSearch('')
    setConfirmCancel(false)
    setSubmitError(null)
    reset(
      order
        ? {
            productId: String(order.productId),
            quantity: order.quantity,
            expectedOn: order.expectedOn ?? '',
          }
        : emptyOrder,
    )
    setIsOpen(true)
  }

  // 발주가 바뀌면 목록과, 발주를 빼고 계산하는 대시보드를 다시 받는다.
  async function refreshLists() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['planned-receipts'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
  }

  function showError(error: unknown) {
    // 서버가 틀린 칸을 알려 주면(#29 details.field) 그 칸 아래에 보여 준다.
    if (error instanceof ApiError && error.details?.field === 'quantity') {
      setError('quantity', { message: '1 이상의 정수로 넣어 주세요.' })
      return
    }
    setSubmitError(
      error instanceof ApiError
        ? error.message
        : '저장하지 못했어요. 다시 시도해 주세요.',
    )
  }

  async function save(values: OrderValues) {
    if (calculationBusy) return
    setSubmitError(null)
    const expectedOn = values.expectedOn || null
    try {
      if (editing) {
        const saved = await updatePlannedReceipt(editing.receiptId, {
          quantity: values.quantity,
          expectedOn,
        })
        trackRun(saved.runId)
      } else {
        const saved = await createPlannedReceipt({
          productId: Number(values.productId),
          quantity: values.quantity,
          expectedOn,
        })
        trackRun(saved.runId)
      }
      await refreshLists()
      setIsOpen(false)
    } catch (error) {
      showError(error)
    }
  }

  async function cancelOrder() {
    if (calculationBusy) return
    if (!editing) return
    if (!confirmCancel) {
      setConfirmCancel(true)
      return
    }
    setSubmitError(null)
    try {
      const saved = await cancelPlannedReceipt(editing.receiptId)
      trackRun(saved.runId)
      await refreshLists()
      setIsOpen(false)
    } catch (error) {
      showError(error)
    }
  }

  // 목록 ×: 바로 취소하고 4초 동안 되돌릴 수 있게(11/10 — 수정 → 발주 취소 → 정말 취소 세 번 누르던 것)
  async function removeOrder(order: PlannedReceipt) {
    if (calculationBusy) return
    setNotice('')
    try {
      const saved = await cancelPlannedReceipt(order.receiptId)
      trackRun(saved.runId)
      setUndo(order)
      await refreshLists()
    } catch (error) {
      setNotice(
        error instanceof ApiError
          ? error.message
          : `${order.skuName} 발주를 취소하지 못했어요. 다시 눌러 주세요.`,
      )
    }
  }

  // 되돌리기 = 같은 상품·수량·도착일로 다시 등록(서버에는 새 발주로 남는다)
  async function undoRemove() {
    if (!undo) return
    const order = undo
    setUndo(null)
    try {
      const saved = await createPlannedReceipt({
        productId: order.productId,
        quantity: order.quantity,
        expectedOn: order.expectedOn,
      })
      trackRun(saved.runId)
      await refreshLists()
    } catch {
      setNotice(
        `${order.skuName} 발주를 되돌리지 못했어요. 등록으로 다시 넣어 주세요.`,
      )
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2>이미 발주한 물량</h2>
          <p>발주했지만 아직 안 온 물량은 그만큼 빼고 계산해요.</p>
        </div>
        <Button
          disabled={calculationBusy}
          onClick={() => openModal(null)}
          type="button"
        >
          등록
        </Button>
      </div>
      {receipts.isPending ? (
        <p className={styles.empty}>발주 물량을 불러오고 있어요.</p>
      ) : receipts.isError ? (
        <p className={styles.empty} role="alert">
          발주 물량을 불러오지 못했어요. {receipts.error.message}
        </p>
      ) : orders.length === 0 ? (
        <p className={styles.empty}>등록한 발주 물량이 없어요.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table>
            <colgroup>
              <col />
              <col className={styles.qtyCol} />
              <col className={styles.dateCol} />
              <col className={styles.statusCol} />
              <col className={styles.actCol} />
            </colgroup>
            <thead>
              <tr>
                <th>상품</th>
                <th className={styles.num}>수량</th>
                <th>도착 예정일</th>
                <th>계산 반영</th>
                <th>
                  <span className={styles.srOnly}>고치기·지우기</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  data-arrived={order.status === 'RECEIVED' || undefined}
                  key={order.receiptId}
                >
                  <td>
                    <strong>{order.skuName}</strong>
                  </td>
                  <td className={styles.num}>
                    <strong>{order.quantity.toLocaleString()}개</strong>
                  </td>
                  <td data-overdue={order.status === 'OVERDUE'}>
                    {order.expectedOn ? (
                      <span className={styles.nowrap}>
                        {shortDay(order.expectedOn)}
                        {order.status === 'OVERDUE' &&
                          ` · ${daysPast(order.expectedOn, today)}일 지남`}
                      </span>
                    ) : (
                      '미정'
                    )}
                  </td>
                  <td>
                    <span
                      className={styles.status}
                      data-status={statusView[order.status].key}
                    >
                      {statusView[order.status].label}
                    </span>
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <Button
                        aria-label={`${order.skuName} 수정`}
                        disabled={calculationBusy}
                        onClick={() => openModal(order)}
                        type="button"
                        variant="secondary"
                      >
                        수정
                      </Button>
                      <button
                        aria-label={`${order.skuName} 발주 취소`}
                        className={styles.rowClear}
                        disabled={calculationBusy}
                        onClick={() => void removeOrder(order)}
                        title="발주 취소"
                        type="button"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <path d="M7 7l10 10M17 7L7 17" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isOpen && (
        <Modal
          labelledBy="purchase-order-title"
          onClose={() => setIsOpen(false)}
        >
          <form className={styles.modal} onSubmit={handleSubmit(save)}>
            <div className={styles.modalHead}>
              <h2 id="purchase-order-title">
                이미 발주한 물량 {editing ? '수정' : '등록'}
              </h2>
              <button
                aria-label="닫기"
                className={styles.close}
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M7 7l10 10M17 7L7 17" />
                </svg>
              </button>
            </div>
            <p>
              아직 도착하지 않은 물량을 넣으면, 그만큼 빼고 권장량을 계산해요.
            </p>
            {editing ? (
              // 수정할 때는 상품은 그대로 두고 수량과 도착일만 바꾼다.
              <div className={styles.product}>
                <span>상품</span>
                <strong>{editing.skuName}</strong>
              </div>
            ) : (
              <>
                <input type="hidden" {...register('productId')} />
                <ProductCombo
                  failed={products.isError}
                  invalid={errors.productId?.message}
                  items={activeProducts}
                  onPick={(item) => {
                    setValue('productId', item ? String(item.productId) : '', {
                      shouldValidate: Boolean(item),
                    })
                    // 수량을 아직 안 고쳤으면 그 상품의 권장량을 넣어 둔다
                    const rec = item && recommended.get(item.productId)
                    if (rec && !getFieldState('quantity').isDirty) {
                      setValue('quantity', rec)
                    }
                  }}
                  onQuery={setProductSearch}
                  pending={products.isPending}
                  query={productSearch}
                  recommended={recommended}
                />
              </>
            )}
            <label className={styles.qty}>
              <span>수량</span>
              <span className={styles.unitField}>
                <input
                  aria-label="수량"
                  inputMode="numeric"
                  type="number"
                  {...register('quantity', { valueAsNumber: true })}
                />
                <b>개</b>
              </span>
              {errors.quantity && (
                <small role="alert">{errors.quantity.message}</small>
              )}
            </label>
            <div
              aria-labelledby="arrival-date-label"
              className={styles.dateField}
              role="group"
            >
              <span className={styles.dateLabel}>
                <span id="arrival-date-label">도착 예정일</span>
                <small>비워 두면 저장만 되고 계산에는 안 넣어요</small>
              </span>
              {editing?.status === 'OVERDUE' && (
                <p className={styles.overdue} role="note">
                  원래 도착 예정일({editing.expectedOn})이 지났어요. 달력의 빨간
                  점이 원래 날짜예요. 새 도착 예정일을 골라 주세요.
                </p>
              )}
              <Controller
                control={control}
                name="expectedOn"
                render={({ field }) => (
                  <DatePicker
                    markedDate={
                      editing?.status === 'OVERDUE'
                        ? (editing.expectedOn ?? undefined)
                        : undefined
                    }
                    markedLabel="지난 도착일"
                    minDate={today}
                    onChange={field.onChange}
                    value={field.value}
                  />
                )}
              />
            </div>
            {submitError && (
              <p className={styles.overdue} role="alert">
                {submitError}
              </p>
            )}
            <div className={styles.actions}>
              {editing && (
                <button
                  className={styles.cancelOrder}
                  data-confirm={confirmCancel || undefined}
                  disabled={calculationBusy || isSubmitting}
                  onClick={() => void cancelOrder()}
                  type="button"
                >
                  {confirmCancel ? '정말 취소하기' : '발주 취소'}
                </button>
              )}
              <Button
                loading={isSubmitting}
                disabled={calculationBusy}
                loadingLabel="저장 중"
                type="submit"
              >
                저장
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {undo && (
        <Toast
          action={{ label: '되돌리기', onClick: () => void undoRemove() }}
          duration={4000}
          message={`${undo.skuName} ${undo.quantity}개 발주를 취소했어요`}
          onClose={() => setUndo(null)}
        />
      )}
      {notice && (
        <Toast duration={4000} message={notice} onClose={() => setNotice('')} />
      )}
    </section>
  )
}
