import { zodResolver } from '@hookform/resolvers/zod'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { ApiError } from '../../../shared/api/client'
import { Button } from '../../../shared/ui/Button/Button'
import { DatePicker } from '../../../shared/ui/DatePicker/DatePicker'
import { Modal } from '../../../shared/ui/Modal/Modal'
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

export function PurchaseOrdersSection() {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  // 수정 중인 발주. null이면 새로 등록한다.
  const [editing, setEditing] = useState<PlannedReceipt | null>(null)
  const [productSearch, setProductSearch] = useState('')
  // 취소는 한 번 더 눌러야 실행한다.
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

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
  const activeProducts = (products.data?.items ?? []).filter(
    (item) => item.isActive,
  )
  const orders = receipts.data?.items ?? []

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
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
  async function refreshAfterChange() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['planned-receipts'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
    setIsOpen(false)
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
    setSubmitError(null)
    const expectedOn = values.expectedOn || null
    try {
      if (editing) {
        await updatePlannedReceipt(editing.receiptId, {
          quantity: values.quantity,
          expectedOn,
        })
      } else {
        await createPlannedReceipt({
          productId: Number(values.productId),
          quantity: values.quantity,
          expectedOn,
        })
      }
      await refreshAfterChange()
    } catch (error) {
      showError(error)
    }
  }

  async function cancelOrder() {
    if (!editing) return
    if (!confirmCancel) {
      setConfirmCancel(true)
      return
    }
    setSubmitError(null)
    try {
      await cancelPlannedReceipt(editing.receiptId)
      await refreshAfterChange()
    } catch (error) {
      showError(error)
    }
  }

  const productPlaceholder = products.isPending
    ? '상품을 불러오고 있어요'
    : activeProducts.length > 0
      ? '상품을 골라 주세요'
      : productSearch
        ? '검색 결과가 없어요'
        : '등록된 상품이 없어요'

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2>이미 발주한 물량</h2>
          <p>발주했지만 아직 안 온 물량은 그만큼 빼고 계산해요.</p>
        </div>
        <Button onClick={() => openModal(null)} type="button">
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
            <thead>
              <tr>
                <th>상품</th>
                <th className={styles.num}>수량</th>
                <th>도착 예정일</th>
                <th>계산 반영</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.receiptId}>
                  <td>
                    <strong>{order.skuName}</strong>
                  </td>
                  <td className={styles.num}>
                    <strong>{order.quantity}개</strong>
                  </td>
                  <td data-overdue={order.status === 'OVERDUE'}>
                    {order.expectedOn ?? '미정'}
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
                    <Button
                      aria-label={`${order.skuName} 수정`}
                      onClick={() => openModal(order)}
                      type="button"
                      variant="secondary"
                    >
                      수정
                    </Button>
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
            <h2 id="purchase-order-title">
              이미 발주한 물량 {editing ? '수정' : '등록'}
            </h2>
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
                <label>
                  <span>상품 검색</span>
                  <input
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="상품명 · 바코드"
                    type="search"
                    value={productSearch}
                  />
                </label>
                <label>
                  <span>상품</span>
                  <select
                    {...register('productId')}
                    disabled={activeProducts.length === 0}
                  >
                    <option value="">{productPlaceholder}</option>
                    {activeProducts.map((item) => (
                      <option key={item.productId} value={item.productId}>
                        {item.skuName} · {item.skuBarcode}
                      </option>
                    ))}
                  </select>
                  {products.isError && (
                    <small role="alert">상품 목록을 불러오지 못했어요.</small>
                  )}
                  {!products.isPending &&
                    !products.isError &&
                    !productSearch &&
                    activeProducts.length === 0 && (
                      <small>수불부를 올리면 상품이 자동으로 등록돼요.</small>
                    )}
                  {errors.productId && (
                    <small role="alert">{errors.productId.message}</small>
                  )}
                </label>
              </>
            )}
            <div className={styles.fields}>
              <label>
                <span>수량</span>
                <input
                  type="number"
                  {...register('quantity', { valueAsNumber: true })}
                />
                {errors.quantity && (
                  <small role="alert">{errors.quantity.message}</small>
                )}
              </label>
            </div>
            <div
              aria-labelledby="arrival-date-label"
              className={styles.dateField}
              role="group"
            >
              <span id="arrival-date-label">도착 예정일</span>
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
                    onChange={field.onChange}
                    value={field.value}
                  />
                )}
              />
            </div>
            <aside>
              도착 예정일을 비워 두면 저장은 되지만 계산에는 넣지 않아요.
            </aside>
            {submitError && (
              <p className={styles.overdue} role="alert">
                {submitError}
              </p>
            )}
            <div className={styles.actions}>
              {editing && (
                <Button
                  onClick={() => void cancelOrder()}
                  type="button"
                  variant="text"
                >
                  {confirmCancel ? '정말 취소하기' : '발주 취소'}
                </Button>
              )}
              <Button
                onClick={() => setIsOpen(false)}
                type="button"
                variant="secondary"
              >
                닫기
              </Button>
              <Button
                loading={isSubmitting}
                loadingLabel="저장 중"
                type="submit"
              >
                저장
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}
