import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { ApiError } from '../../../shared/api/client'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { Button } from '../../../shared/ui/Button/Button'
import { PurchaseOrdersSection } from '../components/PurchaseOrdersSection'
import {
  getDefaultSettings,
  getProductSettings,
  saveDefaultSettings,
  saveProductSettings,
  setProductActive,
} from '../model/inboundSettingsApi'
import styles from './SettingsPage.module.css'

const positiveInteger = z
  .number({ error: '숫자를 입력해 주세요.' })
  .int('1 이상의 정수로 넣어 주세요.')
  .positive('1 이상의 정수로 넣어 주세요.')

const settingsSchema = z.object({
  defaults: z.object({
    leadTime: positiveInteger,
    orderCycle: positiveInteger,
    inboundUnit: positiveInteger,
  }),
  products: z.array(
    z.object({
      productId: z.number(),
      barcode: z.string(),
      name: z.string(),
      leadTime: positiveInteger,
      orderCycle: positiveInteger,
      inboundUnit: positiveInteger,
      cost: z
        .number({ error: '숫자를 입력해 주세요.' })
        .int('0 이상의 정수로 넣어 주세요.')
        .min(0, '0 이상의 정수로 넣어 주세요.'),
      overridden: z.boolean(),
      isActive: z.boolean(),
    }),
  ),
})

type SettingsValues = z.infer<typeof settingsSchema>

// 서버(P1·S1)의 값을 화면 칸 이름으로 옮긴다. 원가가 비어 있으면 0으로 본다.
async function loadSettings(): Promise<{
  values: SettingsValues
  sourceIsEstimated: boolean
}> {
  const [defaults, products] = await Promise.all([
    getDefaultSettings(),
    getProductSettings(),
  ])
  return {
    sourceIsEstimated: defaults.reviewCycleSource === 'ESTIMATED',
    values: {
      defaults: {
        leadTime: defaults.leadTimeDays,
        orderCycle: defaults.reviewCycleDays,
        inboundUnit: defaults.orderUnitQty,
      },
      products: products.items.map((item) => ({
        productId: item.productId,
        barcode: item.skuBarcode,
        name: item.skuName,
        leadTime: item.settings.leadTimeDays,
        orderCycle: item.settings.reviewCycleDays,
        inboundUnit: item.settings.orderUnitQty,
        cost: item.unitCost ?? 0,
        overridden: item.overridden.length > 0,
        isActive: item.isActive,
      })),
    },
  }
}

// 계산 시작 효과 시간. CSS의 ship 애니메이션과 같다.
const SHIP_MS = 900

export function SettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  // 저장 뒤 상자가 오른쪽으로 출고되는 짧은 효과를 보여 준 다음 대시보드로 간다.
  const [shipping, setShipping] = useState(false)
  // 사용 스위치를 누르는 중인 상품, 저장·스위치 실패 안내
  const [activeBusy, setActiveBusy] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['inbound-settings'],
    queryFn: loadSettings,
  })
  const {
    register,
    reset,
    handleSubmit,
    control,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      defaults: { leadTime: 5, orderCycle: 29, inboundUnit: 1 },
      products: [],
    },
  })

  useEffect(() => {
    if (query.data) reset(query.data.values)
  }, [query.data, reset])

  const products = useWatch({ control, name: 'products' })
  const filteredProducts = useMemo(
    () =>
      products
        .map((product, index) => ({ index, product }))
        .filter(({ product }) =>
          `${product.name} ${product.barcode}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        ),
    [products, search],
  )

  // 사용 여부는 서버가 알아서 끄지 않으므로(업로드에 안 나와도 그대로) 셀러가 켜고 끄고, 누르는 즉시 저장한다.
  async function toggleActive(index: number) {
    const field = `products.${index}.isActive` as const
    const productId = getValues(`products.${index}.productId`)
    const next = !getValues(field)
    setFormError(null)
    setActiveBusy(productId)
    setValue(field, next)
    try {
      await setProductActive(productId, next)
      // 발주 상품 고르기 목록에도 바로 반영한다.
      await queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch (error) {
      setValue(field, !next)
      setFormError(
        error instanceof ApiError
          ? error.message
          : '사용 여부를 바꾸지 못했어요. 다시 시도해 주세요.',
      )
    } finally {
      setActiveBusy(null)
    }
  }

  async function save(values: SettingsValues) {
    setFormError(null)
    const before = new Map(
      (query.data?.values.products ?? []).map((item) => [item.productId, item]),
    )
    try {
      // 바꾼 상품만 먼저 저장하고, 마지막에 기본값을 저장하면서 계산을 시작한다.
      for (const item of values.products) {
        const old = before.get(item.productId)
        const conditionsChanged =
          !old ||
          old.leadTime !== item.leadTime ||
          old.orderCycle !== item.orderCycle ||
          old.inboundUnit !== item.inboundUnit
        const costChanged = !old || old.cost !== item.cost
        if (!conditionsChanged && !costChanged) continue
        await saveProductSettings(item.productId, {
          leadTimeDays: item.leadTime,
          reviewCycleDays: item.orderCycle,
          orderUnitQty: item.inboundUnit,
          ...(costChanged ? { unitCost: item.cost } : {}),
        })
      }
      await saveDefaultSettings({
        leadTimeDays: values.defaults.leadTime,
        reviewCycleDays: values.defaults.orderCycle,
        orderUnitQty: values.defaults.inboundUnit,
        recalculate: true,
      })
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : '저장하지 못했어요. 다시 시도해 주세요.',
      )
      return
    }
    // 저장이 끝나면 대시보드로 보내고, 안내는 그 화면에서 토스트로 보여준다.
    const goDashboard = () =>
      navigate('/dashboard', { state: { toast: '입고 조건을 저장했어요' } })
    const animate =
      typeof window.matchMedia === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!animate) return goDashboard()
    setShipping(true)
    window.setTimeout(goDashboard, SHIP_MS)
  }

  if (query.isPending) {
    return (
      <AsyncState
        description="상품별 입고 조건을 불러오고 있어요."
        status="loading"
        title="입고 조건을 준비하고 있어요"
      />
    )
  }

  if (query.isError) {
    return (
      <AsyncState
        description={query.error.message}
        onRetry={() => void query.refetch()}
        status="error"
        title="입고 조건을 불러오지 못했어요"
      />
    )
  }

  return (
    <div className={styles.page}>
      <form
        className={styles.page}
        id="inbound-settings-form"
        onSubmit={handleSubmit(save)}
      >
        <header className={styles.intro}>
          <h1>입고 조건을 확인해 주세요</h1>
          <p>
            한 번 확인하면 다음 계산부터 계속 써요. 상품마다 다르면 아래에서
            따로 바꿀 수 있어요.
          </p>
        </header>

        <section className={styles.card}>
          <h2>모든 상품 기본값</h2>
          <div className={styles.defaultGrid}>
            <label>
              <span>리드타임</span>
              <div>
                <input
                  type="number"
                  {...register('defaults.leadTime', { valueAsNumber: true })}
                />
                <b>일</b>
              </div>
              <small>
                {errors.defaults?.leadTime?.message ?? '발주부터 입고 도착까지'}
              </small>
            </label>
            <label>
              <span>입고 주기</span>
              <div>
                <input
                  type="number"
                  {...register('defaults.orderCycle', { valueAsNumber: true })}
                />
                <b>일</b>
              </div>
              <small>
                {errors.defaults?.orderCycle?.message ??
                  (query.data?.sourceIsEstimated
                    ? '수불부 입고 간격으로 추정했어요'
                    : '직접 정해 저장한 값이에요')}
              </small>
            </label>
            <label>
              <span>입고 단위</span>
              <div>
                <input
                  type="number"
                  {...register('defaults.inboundUnit', { valueAsNumber: true })}
                />
                <b>개</b>
              </div>
              <small>
                {errors.defaults?.inboundUnit?.message ??
                  '박스 단위가 있으면 바꿔 주세요'}
              </small>
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>상품별로 다른 조건</h2>
              <p>굵은 값은 기본값과 다르게 바꾼 값이에요.</p>
            </div>
            <input
              aria-label="상품명 또는 바코드 검색"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="상품명 · 바코드 검색"
              type="search"
              value={search}
            />
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>상품</th>
                  <th>리드타임</th>
                  <th>입고 주기</th>
                  <th>입고 단위</th>
                  <th>원가</th>
                  <th>사용</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(({ index, product }) => (
                  <tr
                    data-inactive={!product.isActive}
                    data-overridden={product.overridden}
                    key={product.productId}
                  >
                    <td>
                      <strong>{product.name}</strong>
                      <span>{product.barcode}</span>
                    </td>
                    {(
                      ['leadTime', 'orderCycle', 'inboundUnit', 'cost'] as const
                    ).map((field) => (
                      <td key={field}>
                        <input
                          aria-label={`${product.name} ${field}`}
                          type="number"
                          {...register(`products.${index}.${field}`, {
                            valueAsNumber: true,
                          })}
                        />
                        {errors.products?.[index]?.[field] && (
                          <small role="alert">
                            {errors.products[index]?.[field]?.message}
                          </small>
                        )}
                      </td>
                    ))}
                    <td>
                      <label className={styles.switch}>
                        <input
                          aria-label={`${product.name} 사용`}
                          checked={product.isActive}
                          disabled={activeBusy === product.productId}
                          onChange={() => void toggleActive(index)}
                          role="switch"
                          type="checkbox"
                        />
                        <span>
                          {product.isActive ? '사용 중' : '사용 안 함'}
                        </span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {formError && (
            <p className={styles.formError} role="alert">
              {formError}
            </p>
          )}
          {filteredProducts.length === 0 && (
            <p className={styles.empty}>검색 결과가 없어요.</p>
          )}
        </section>
      </form>

      {/* 발주 팝업에도 form이 있어서, 입고 조건 form 밖에 둔다. form 안에 form이 있으면 저장이 페이지 새로고침이 된다. */}
      <PurchaseOrdersSection />

      <footer className={styles.actions}>
        <Button
          onClick={() => navigate('/dashboard')}
          title="저장하지 않고 대시보드로 이동해요"
          type="button"
          variant="text"
        >
          ← 대시보드로
        </Button>
        <Button
          loading={isSubmitting}
          loadingLabel="계산 요청 중"
          form="inbound-settings-form"
          type="submit"
        >
          확인하고 계산하기
        </Button>
      </footer>
      {shipping && (
        <div aria-live="polite" className={styles.ship} role="status">
          <img alt="" height="88" src="/logo.png" width="88" />
          <strong>계산을 시작했어요</strong>
        </div>
      )}
    </div>
  )
}
