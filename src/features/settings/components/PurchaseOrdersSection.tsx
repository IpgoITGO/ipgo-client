import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { apiRequest } from '../../../shared/api/client'
import { Button } from '../../../shared/ui/Button/Button'
import { DatePicker } from '../../../shared/ui/DatePicker/DatePicker'
import { Modal } from '../../../shared/ui/Modal/Modal'
import styles from './PurchaseOrdersSection.module.css'

type PurchaseOrder = {
  arrivalDate: string | null
  barcode: string
  id: string
  productName: string
  quantity: number
  status: 'reflecting' | 'arrived' | 'overdue' | 'no-date'
}

const orderSchema = z.object({
  product: z.string().min(1, '상품을 골라 주세요.'),
  quantity: z
    .number()
    .int('1 이상의 정수로 넣어 주세요.')
    .positive('1 이상의 정수로 넣어 주세요.'),
  arrivalDate: z.string(),
})

type OrderValues = z.infer<typeof orderSchema>

const statusLabels = {
  reflecting: '계산에 반영 중',
  arrived: '도착 완료 · 입고 확인',
  overdue: '도착일 지남 · 확인 필요',
  'no-date': '도착일 없어 반영 안 돼요',
}

const emptyOrder: OrderValues = {
  product: '케어트릿 120g|8800272420016',
  quantity: 1,
  arrivalDate: '',
}

export function PurchaseOrdersSection() {
  const [isOpen, setIsOpen] = useState(false)
  // 수정 중인 발주. null이면 새로 등록한다.
  const [editing, setEditing] = useState<PurchaseOrder | null>(null)
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null)
  const query = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => apiRequest<PurchaseOrder[]>('/purchase-orders'),
  })
  const displayOrders = orders ?? query.data ?? []
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OrderValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: emptyOrder,
  })

  function openModal(order: PurchaseOrder | null) {
    setEditing(order)
    reset(
      order
        ? {
            product: `${order.productName}|${order.barcode}`,
            quantity: order.quantity,
            arrivalDate: order.arrivalDate ?? '',
          }
        : emptyOrder,
    )
    setIsOpen(true)
  }

  async function save(values: OrderValues) {
    const [productName, barcode] = values.product.split('|')
    const order = await apiRequest<PurchaseOrder>(
      editing ? `/purchase-orders/${editing.id}` : '/purchase-orders',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, productName, barcode }),
      },
    )
    setOrders(
      editing
        ? displayOrders.map((item) => (item.id === order.id ? order : item))
        : [...displayOrders, order],
    )
    setIsOpen(false)
  }

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
      {query.isPending ? (
        <p className={styles.empty}>발주 물량을 불러오고 있어요.</p>
      ) : displayOrders.length === 0 ? (
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
              {displayOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.productName}</strong>
                    <span>{order.barcode}</span>
                  </td>
                  <td className={styles.num}>
                    <strong>{order.quantity}개</strong>
                  </td>
                  <td data-overdue={order.status === 'overdue'}>
                    {order.arrivalDate ?? '미정'}
                  </td>
                  <td>
                    <span className={styles.status} data-status={order.status}>
                      {statusLabels[order.status]}
                    </span>
                  </td>
                  <td>
                    <Button
                      aria-label={`${order.productName} 수정`}
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
                <strong>
                  {editing.productName} · {editing.barcode}
                </strong>
              </div>
            ) : (
              <label>
                <span>상품</span>
                <select {...register('product')}>
                  <option value="케어트릿 120g|8800272420016">
                    케어트릿 120g · 8800272420016
                  </option>
                  <option value="덴탈껌 S 10입|8800272421044">
                    덴탈껌 S 10입 · 8800272421044
                  </option>
                </select>
                {errors.product && (
                  <small role="alert">{errors.product.message}</small>
                )}
              </label>
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
              {editing?.status === 'overdue' && (
                <p className={styles.overdue} role="note">
                  원래 도착 예정일({editing.arrivalDate})이 지났어요. 달력의
                  빨간 점이 원래 날짜예요. 새 도착 예정일을 골라 주세요.
                </p>
              )}
              <Controller
                control={control}
                name="arrivalDate"
                render={({ field }) => (
                  <DatePicker
                    markedDate={
                      editing?.status === 'overdue'
                        ? (editing.arrivalDate ?? undefined)
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
            <div className={styles.actions}>
              <Button
                onClick={() => setIsOpen(false)}
                type="button"
                variant="secondary"
              >
                취소
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
