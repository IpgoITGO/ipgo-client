import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { apiRequest } from '../../../shared/api/client'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { Button } from '../../../shared/ui/Button/Button'
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
      barcode: z.string(),
      name: z.string(),
      leadTime: positiveInteger,
      orderCycle: positiveInteger,
      inboundUnit: positiveInteger,
      cost: positiveInteger,
      overridden: z.boolean(),
    }),
  ),
})

type SettingsValues = z.infer<typeof settingsSchema>

export function SettingsPage() {
  const [search, setSearch] = useState('')
  const [saved, setSaved] = useState(false)
  const query = useQuery({
    queryKey: ['inbound-settings'],
    queryFn: () => apiRequest<SettingsValues>('/settings/inbound'),
  })
  const {
    register,
    reset,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      defaults: { leadTime: 5, orderCycle: 29, inboundUnit: 1 },
      products: [],
    },
  })

  useEffect(() => {
    if (query.data) reset(query.data)
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

  async function save(values: SettingsValues) {
    await apiRequest('/settings/inbound', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    setSaved(true)
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
    <form className={styles.page} onSubmit={handleSubmit(save)}>
      <header className={styles.intro}>
        <h1>입고 조건을 확인해 주세요</h1>
        <p>
          한 번 확인하면 다음 계산부터 계속 써요. 상품마다 다르면 아래에서 따로
          바꿀 수 있어요.
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
                '수불부 입고 간격으로 추정했어요'}
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
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(({ index, product }) => (
                <tr data-overridden={product.overridden} key={product.barcode}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredProducts.length === 0 && (
          <p className={styles.empty}>검색 결과가 없어요.</p>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>이미 발주한 물량</h2>
            <p>발주했지만 아직 안 온 물량은 다음 단계에서 등록할 수 있어요.</p>
          </div>
          <Button disabled type="button" variant="secondary">
            등록
          </Button>
        </div>
      </section>

      {saved && (
        <p className={styles.saved} role="status">
          입고 조건을 저장했어요.
        </p>
      )}
      <footer className={styles.actions}>
        <Button
          loading={isSubmitting}
          loadingLabel="계산 요청 중"
          type="submit"
        >
          확인하고 계산하기
        </Button>
      </footer>
    </form>
  )
}
