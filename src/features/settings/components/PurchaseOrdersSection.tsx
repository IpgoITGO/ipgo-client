import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { apiRequest } from '../../../shared/api/client'
import { Button } from '../../../shared/ui/Button/Button'
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

export function PurchaseOrdersSection() {
  const [isOpen, setIsOpen] = useState(false)
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null)
  const query = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => apiRequest<PurchaseOrder[]>('/purchase-orders'),
  })
  const displayOrders = orders ?? query.data ?? []
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OrderValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      product: '케어트릿 120g|8800272420016',
      quantity: 1,
      arrivalDate: '',
    },
  })

  function openModal() {
    reset({
      product: '케어트릿 120g|8800272420016',
      quantity: 1,
      arrivalDate: '',
    })
    setIsOpen(true)
  }

  async function save(values: OrderValues) {
    const [productName, barcode] = values.product.split('|')
    const order = await apiRequest<PurchaseOrder>('/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, productName, barcode }),
    })
    setOrders([...displayOrders, order])
    setIsOpen(false)
  }

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2>이미 발주한 물량</h2>
          <p>발주했지만 아직 안 온 물량은 그만큼 빼고 계산해요.</p>
        </div>
        <Button onClick={openModal} type="button">
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
                <th>수량</th>
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
                  <td>
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
                      onClick={openModal}
                      type="button"
                      variant="secondary"
                    >
                      {order.status === 'overdue' ? '도착일 고치기' : '수정'}
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
            <h2 id="purchase-order-title">이미 발주한 물량 등록</h2>
            <p>
              아직 도착하지 않은 물량을 넣으면, 그만큼 빼고 권장량을 계산해요.
            </p>
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
              <label>
                <span>도착 예정일</span>
                <input type="date" {...register('arrivalDate')} />
              </label>
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
