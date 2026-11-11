import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ClipboardEvent, useEffect, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { ApiError } from '../../../shared/api/client'
import { useCalculation } from '../../../shared/api/calculationContext'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { Button } from '../../../shared/ui/Button/Button'
import { LockedButton } from '../../billing/components/LockedButton'
import { useCalcLock } from '../../billing/model/useCalcLock'
import { PurchaseOrdersSection } from '../components/PurchaseOrdersSection'
import { StorageCostSection } from '../components/StorageCostSection'
import {
  getDefaultSettings,
  getProductSettings,
  saveDefaultSettings,
  saveProductSettings,
  setProductActive,
} from '../model/inboundSettingsApi'
import { ExpiryDaysField } from '../components/ExpiryDaysField'
import styles from './SettingsPage.module.css'

const positiveInteger = z
  .number({ error: '숫자를 입력해 주세요.' })
  .int('1 이상의 정수로 넣어 주세요.')
  .positive('1 이상의 정수로 넣어 주세요.')

const settingsSchema = z.object({
  defaults: z.object({
    leadTime: positiveInteger,
    orderCycle: positiveInteger.nullable().refine((value) => value !== null, {
      message: '입고 주기를 입력해 주세요.',
    }),
    inboundUnit: positiveInteger,
  }),
  products: z.array(
    z.object({
      productId: z.number(),
      barcode: z.string(),
      name: z.string(),
      leadTime: positiveInteger,
      orderCycle: positiveInteger.nullable(),
      inboundUnit: positiveInteger,
      // 서버에 단가가 없으면 null(빈칸 + "미입력"). 0원으로 채우면 넣은 값처럼 보인다.
      // 있던 값을 지우면 NaN이라 "숫자를 입력해 주세요"가 뜬다(전과 같음).
      cost: z
        .number({ error: '숫자를 입력해 주세요.' })
        .int('0 이상의 정수로 넣어 주세요.')
        .min(0, '0 이상의 정수로 넣어 주세요.')
        .nullable(),
      // 기본값 대신 상품별 값을 쓰는 칸(화면 칸 이름). 그 칸만 굵게 보여 준다.
      overridden: z.array(z.string()),
      isActive: z.boolean(),
    }),
  ),
})

type SettingsValues = z.input<typeof settingsSchema>
type ConfirmedSettings = z.output<typeof settingsSchema>

// 서버 칸 이름 → 화면 칸 이름
const FIELD_OF: Record<string, string> = {
  leadTimeDays: 'leadTime',
  reviewCycleDays: 'orderCycle',
  orderUnitQty: 'inboundUnit',
}

// 칸 안에는 숫자만, 단위는 칸 밖에 둔다.
const PRODUCT_FIELDS = [
  { field: 'leadTime', unit: '일', label: '리드타임' },
  { field: 'orderCycle', unit: '일', label: '입고 주기' },
  { field: 'inboundUnit', unit: '개', label: '입고 단위' },
] as const

// 입고 기록이 모자라 서버가 주기를 못 정하면 처음부터 이 값을 넣어 두고 셀러가 고치게 한다(11/11 — 빈칸이면 계산을 못 눌렀음)
const FALLBACK_ORDER_CYCLE = 14

type ProductField = (typeof PRODUCT_FIELDS)[number]['field']
// 한 번에 넣기 칸(64px) 안 안내 글자는 잘리지 않게 두 글자로
const BULK_HINT: Record<ProductField, string> = {
  leadTime: '리드',
  orderCycle: '주기',
  inboundUnit: '단위',
}
type RowFilter = 'all' | 'changed' | 'noCost' | 'off'
type Row = SettingsValues['products'][number]
const ROW_FILTERS: Record<
  RowFilter,
  { label: string; test: (row: Row) => boolean }
> = {
  all: { label: '전체', test: () => true },
  changed: { label: '바꾼 상품', test: (row) => row.overridden.length > 0 },
  noCost: {
    label: '원가 빈 상품',
    test: (row) => row.cost == null || !Number.isFinite(row.cost),
  },
  off: { label: '꺼진 상품', test: (row) => !row.isActive },
}

// 사용 스위치를 누른 뒤 "저장됨" 안내를 보여 주는 시간
const SAVED_MS = 2000

// 서버(P1·S1)의 값을 화면 칸 이름으로 옮긴다. 원가가 비어 있으면 0으로 본다.
async function loadSettings(): Promise<{
  values: SettingsValues
  sourceIsEstimated: boolean
  cycleIsFallback: boolean
}> {
  const [defaults, products] = await Promise.all([
    getDefaultSettings(),
    getProductSettings(),
  ])
  return {
    sourceIsEstimated: defaults.reviewCycleSource === 'ESTIMATED',
    cycleIsFallback: defaults.reviewCycleDays == null,
    values: {
      defaults: {
        leadTime: defaults.leadTimeDays,
        orderCycle: defaults.reviewCycleDays ?? FALLBACK_ORDER_CYCLE,
        inboundUnit: defaults.orderUnitQty,
      },
      products: products.items.map((item) => ({
        productId: item.productId,
        barcode: item.skuBarcode,
        name: item.skuName,
        leadTime: item.settings.leadTimeDays,
        orderCycle: item.settings.reviewCycleDays,
        inboundUnit: item.settings.orderUnitQty,
        cost: item.unitCost,
        overridden: item.overridden.map((name) => FIELD_OF[name] ?? name),
        isActive: item.isActive,
      })),
    },
  }
}

// 계산 시작 효과 시간. CSS의 ship 애니메이션과 같다.
const SHIP_MS = 900

export function SettingsPage() {
  const { trackRun, busy: calculationBusy } = useCalculation()
  const navigate = useNavigate()
  const lock = useCalcLock()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  // 상품이 수백 개라(실데이터 289개) 거르기 + 골라서 같은 조건 한 번에 넣기(11/11)
  const [filter, setFilter] = useState<RowFilter>('all')
  const [picked, setPicked] = useState<Set<number>>(() => new Set())
  const [bulk, setBulk] = useState<Record<ProductField, string>>({
    leadTime: '',
    orderCycle: '',
    inboundUnit: '',
  })
  const [bulkError, setBulkError] = useState('')
  // 저장 뒤 상자가 오른쪽으로 출고되는 짧은 효과를 보여 준 다음 대시보드로 간다.
  const [shipping, setShipping] = useState(false)
  // 사용 스위치를 누르는 중인 상품, 저장·스위치 실패 안내
  const [activeBusy, setActiveBusy] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  // 표 위 한 줄 안내. 줄마다 글자를 바꾸지 않아 스위치 자리가 움직이지 않는다.
  const [savedNotice, setSavedNotice] = useState('')
  useEffect(() => {
    if (!savedNotice) return
    const timer = window.setTimeout(() => setSavedNotice(''), SAVED_MS)
    return () => window.clearTimeout(timer)
  }, [savedNotice])
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
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<SettingsValues, unknown, ConfirmedSettings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      defaults: { leadTime: 5, orderCycle: null, inboundUnit: 1 },
      products: [],
    },
  })

  useEffect(() => {
    if (query.data) reset(query.data.values, { keepDirtyValues: true })
  }, [query.data, reset])

  const products = useWatch({ control, name: 'products' })
  const defaults = useWatch({ control, name: 'defaults' })
  useEffect(() => {
    getValues('products').forEach((product, index) => {
      PRODUCT_FIELDS.forEach(({ field }) => {
        if (!product.overridden.includes(field)) {
          const value = defaults?.[field]
          if (value !== undefined && product[field] !== value) {
            setValue(`products.${index}.${field}`, value)
          }
        }
      })
    })
  }, [defaults, products, dirtyFields.products, getValues, setValue])
  const filteredProducts = useMemo(
    () =>
      products
        .map((product, index) => ({ index, product }))
        .filter(
          ({ product }) =>
            ROW_FILTERS[filter].test(product) &&
            `${product.name} ${product.barcode}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        ),
    [products, search, filter],
  )
  const shownIds = filteredProducts
    .filter(({ product }) => product.isActive)
    .map(({ product }) => product.productId)
  const allShownPicked =
    shownIds.length > 0 && shownIds.every((id) => picked.has(id))

  function togglePick(id: number) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  // 고른 상품에 적은 칸만 넣는다(빈 칸은 그대로). 직접 친 것과 같게 "바꾼 칸"으로 표시
  function applyBulk() {
    const values = PRODUCT_FIELDS.flatMap(({ field }) => {
      const text = bulk[field].trim()
      if (text === '') return []
      const value = Number(text)
      return [{ field, value, ok: Number.isInteger(value) && value > 0 }]
    })
    if (values.length === 0 || values.some((item) => !item.ok)) {
      setBulkError('넣을 칸에 1 이상의 정수를 적어 주세요')
      return
    }
    setBulkError('')
    getValues('products').forEach((product, index) => {
      if (!picked.has(product.productId) || !product.isActive) return
      values.forEach(({ field, value }) =>
        setValue(`products.${index}.${field}`, value, { shouldDirty: true }),
      )
      const overridden = getValues(`products.${index}.overridden`)
      setValue(
        `products.${index}.overridden`,
        [...new Set([...overridden, ...values.map(({ field }) => field)])],
        { shouldDirty: true },
      )
    })
    setSavedNotice(`✓ 상품 ${picked.size}개에 넣었어요 · 계산할 때 저장돼요`)
    setPicked(new Set())
  }
  // 엑셀 원가 열을 복사해 붙여 넣으면 지금 보이는 순서대로 아래 줄까지 채운다
  function pasteCosts(event: ClipboardEvent<HTMLInputElement>, from: number) {
    const lines = event.clipboardData
      .getData('text')
      .split(/\r?\n/)
      .map((line) => line.replace(/\D/g, ''))
    while (lines.length > 0 && lines.at(-1) === '') lines.pop()
    if (lines.length < 2) return
    event.preventDefault()
    const start = filteredProducts.findIndex(({ index }) => index === from)
    lines.forEach((digits, offset) => {
      const row = filteredProducts[start + offset]
      if (!row || !row.product.isActive || digits === '') return
      setValue(`products.${row.index}.cost`, Number(digits), {
        shouldDirty: true,
      })
    })
    setSavedNotice(`✓ 원가 ${lines.length}줄을 붙여 넣었어요`)
  }

  // 사용 여부는 서버가 알아서 끄지 않으므로(업로드에 안 나와도 그대로) 셀러가 켜고 끄고, 누르는 즉시 저장한다.
  async function toggleActive(index: number) {
    const field = `products.${index}.isActive` as const
    const productId = getValues(`products.${index}.productId`)
    const next = !getValues(field)
    setFormError(null)
    setSavedNotice('')
    setActiveBusy(productId)
    setValue(field, next)
    try {
      await setProductActive(productId, next)
      setSavedNotice(
        `✓ ${getValues(`products.${index}.name`)} ${next ? '켰어요' : '껐어요'} · 저장됨`,
      )
      // 발주 상품 고르기 목록과, 꺼 둔 상품을 빼고 보여 주는 대시보드에도 바로 반영한다.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
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

  async function save(values: ConfirmedSettings) {
    if (calculationBusy || values.defaults.orderCycle == null) return
    setFormError(null)
    // 상품이 없으면 계산할 게 없다. 계산 시작·완료 안내를 띄우지 않는다.
    if (values.products.length === 0) return
    const before = new Map(
      (query.data?.values.products ?? []).map((item) => [item.productId, item]),
    )
    let runId: number | null = null
    try {
      // 바꾼 상품만 먼저 저장하고, 마지막에 기본값을 저장하면서 계산을 시작한다.
      for (const item of values.products) {
        const old = before.get(item.productId)
        const changedFields = PRODUCT_FIELDS.filter(
          ({ field }) =>
            item.overridden.includes(field) &&
            (old?.overridden.includes(field)
              ? old[field] !== item[field]
              : item[field] !== values.defaults[field]),
        )
        const costChanged = !old || old.cost !== item.cost
        if (changedFields.length === 0 && !costChanged) continue
        // S3는 보낸 칸으로 교체한다. 기존 override와 사용자가 직접 바꾼 칸만 보존한다.
        const explicit = new Set([
          ...(old?.overridden ?? []),
          ...changedFields.map(({ field }) => field),
        ])
        const saved = await saveProductSettings(item.productId, {
          ...(explicit.has('leadTime') ? { leadTimeDays: item.leadTime } : {}),
          ...(explicit.has('orderCycle') && item.orderCycle != null
            ? { reviewCycleDays: item.orderCycle }
            : {}),
          ...(explicit.has('inboundUnit')
            ? { orderUnitQty: item.inboundUnit }
            : {}),
          ...(costChanged && item.cost !== null ? { unitCost: item.cost } : {}),
        })
        trackRun(saved.runId)
      }
      const saved = await saveDefaultSettings({
        leadTimeDays: values.defaults.leadTime,
        reviewCycleDays: values.defaults.orderCycle,
        orderUnitQty: values.defaults.inboundUnit,
        recalculate: true,
      })
      runId = saved.runId
      trackRun(saved.runId)
      await queryClient.invalidateQueries({ queryKey: ['inbound-settings'] })
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
      navigate(runId ? `/dashboard?run=${runId}` : '/dashboard', {
        state: { toast: '입고 조건을 저장했어요' },
      })
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
                  aria-label="기본 입고 주기"
                  {...register('defaults.orderCycle', { valueAsNumber: true })}
                />
                <b>일</b>
              </div>
              <small>
                {errors.defaults?.orderCycle?.message ??
                  (query.data?.cycleIsFallback
                    ? `처음 값 ${FALLBACK_ORDER_CYCLE}일이에요. 실제 입고 주기로 바꿔 주세요`
                    : query.data.sourceIsEstimated
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
            <ExpiryDaysField />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>상품별로 다른 조건</h2>
              <p>
                진한 칸은 기본값과 다르게 바꾼 칸이에요. 바꾸면 바로 저장돼요.
              </p>
            </div>
            <input
              aria-label="상품명 또는 바코드 검색"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="상품명 · 바코드 검색"
              type="search"
              value={search}
            />
          </div>
          {/* 거르기 + 같은 조건 한 번에 넣기. 바는 늘 자리를 잡아 고르기 시작해도 표가 밀리지 않는다 */}
          <div className={styles.rowTools}>
            <div
              aria-label="상품 거르기"
              className={styles.filterChips}
              role="group"
            >
              {(Object.keys(ROW_FILTERS) as RowFilter[]).map((key) => (
                <button
                  aria-pressed={filter === key}
                  key={key}
                  onClick={() => setFilter(key)}
                  type="button"
                >
                  {ROW_FILTERS[key].label}
                  <b>
                    {products
                      .filter(ROW_FILTERS[key].test)
                      .length.toLocaleString()}
                  </b>
                </button>
              ))}
            </div>
            <div
              aria-label="고른 상품에 같은 조건 넣기"
              className={styles.bulkBar}
              data-off={picked.size === 0 || undefined}
              role="group"
            >
              <b>
                {picked.size > 0
                  ? `${picked.size}개 고름`
                  : '같은 조건은 골라서 한 번에'}
              </b>
              {PRODUCT_FIELDS.map(({ field, label, unit }) => (
                <span className={styles.numField} key={field}>
                  <input
                    aria-label={`고른 상품 ${label}`}
                    disabled={picked.size === 0}
                    inputMode="numeric"
                    onChange={(event) =>
                      setBulk((prev) => ({
                        ...prev,
                        [field]: event.target.value.replace(/\D/g, ''),
                      }))
                    }
                    placeholder={BULK_HINT[field]}
                    type="text"
                    value={bulk[field]}
                  />
                  <b>{unit}</b>
                </span>
              ))}
              <button
                className={styles.bulkApply}
                disabled={picked.size === 0}
                onClick={applyBulk}
                type="button"
              >
                넣기
              </button>
              {bulkError && <small role="alert">{bulkError}</small>}
            </div>
          </div>
          <div className={styles.useNote}>
            <p>원가는 엑셀 열을 복사해 첫 칸에 붙여 넣으면 아래로 채워져요.</p>
            <span aria-live="polite" className={styles.savedNotice}>
              {savedNotice}
            </span>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th className={styles.pickHead}>
                    <input
                      aria-label="보이는 상품 모두 고르기"
                      checked={allShownPicked}
                      className={styles.pickBox}
                      disabled={shownIds.length === 0}
                      onChange={(event) =>
                        setPicked((prev) => {
                          const next = new Set(prev)
                          shownIds.forEach((id) =>
                            event.target.checked
                              ? next.add(id)
                              : next.delete(id),
                          )
                          return next
                        })
                      }
                      type="checkbox"
                    />
                  </th>
                  <th>사용</th>
                  <th>상품</th>
                  {PRODUCT_FIELDS.map(({ field, label }) => (
                    <th className={styles.numHead} key={field}>
                      {label}
                    </th>
                  ))}
                  <th className={styles.numHead}>원가</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(({ index, product }) => (
                  <tr
                    data-inactive={!product.isActive}
                    data-picked={picked.has(product.productId) || undefined}
                    key={product.productId}
                  >
                    <td className={styles.pickHead}>
                      <input
                        aria-label={`${product.name} 고르기`}
                        checked={picked.has(product.productId)}
                        className={styles.pickBox}
                        disabled={!product.isActive}
                        onChange={() => togglePick(product.productId)}
                        type="checkbox"
                      />
                    </td>
                    <td className={styles.useCell}>
                      <input
                        aria-label={`${product.name} 사용`}
                        checked={product.isActive}
                        className={styles.switch}
                        disabled={
                          activeBusy === product.productId || calculationBusy
                        }
                        onChange={() => void toggleActive(index)}
                        role="switch"
                        type="checkbox"
                      />
                    </td>
                    <td className={styles.nameCell}>
                      <strong>{product.name}</strong>
                      <span>{product.barcode}</span>
                    </td>
                    {PRODUCT_FIELDS.map(({ field, unit }) => (
                      <td className={styles.numCell} key={field}>
                        <span
                          className={styles.numField}
                          data-changed={product.overridden.includes(field)}
                        >
                          <input
                            aria-label={`${product.name} ${field}`}
                            inputMode="numeric"
                            // 꺼진(단종) 상품은 잠근다. disabled는 react-hook-form이 값을 비워서 readOnly로.
                            readOnly={!product.isActive}
                            type="number"
                            {...register(`products.${index}.${field}`, {
                              valueAsNumber: true,
                              onChange: () => {
                                const path =
                                  `products.${index}.overridden` as const
                                const explicit = getValues(path)
                                if (!explicit.includes(field))
                                  setValue(path, [...explicit, field], {
                                    shouldDirty: true,
                                  })
                              },
                            })}
                          />
                          <b>{unit}</b>
                        </span>
                        {errors.products?.[index]?.[field] && (
                          <small role="alert">
                            {errors.products[index]?.[field]?.message}
                          </small>
                        )}
                      </td>
                    ))}
                    <td className={styles.numCell}>
                      <span className={styles.numField}>
                        {/* 원가는 1,800처럼 쉼표로 보여 주고, 숫자만 골라 저장한다. */}
                        <Controller
                          control={control}
                          name={`products.${index}.cost`}
                          render={({ field }) => (
                            <input
                              aria-label={`${product.name} 원가`}
                              className={styles.costInput}
                              inputMode="numeric"
                              onBlur={field.onBlur}
                              onPaste={(event) => pasteCosts(event, index)}
                              placeholder="미입력"
                              readOnly={!product.isActive}
                              onChange={(event) => {
                                const digits = event.target.value.replace(
                                  /\D/g,
                                  '',
                                )
                                field.onChange(
                                  digits === '' ? Number.NaN : Number(digits),
                                )
                              }}
                              ref={field.ref}
                              type="text"
                              value={
                                field.value != null &&
                                Number.isFinite(field.value)
                                  ? field.value.toLocaleString('ko-KR')
                                  : ''
                              }
                            />
                          )}
                        />
                        <b>원</b>
                      </span>
                      {errors.products?.[index]?.cost && (
                        <small role="alert">
                          {errors.products[index]?.cost?.message}
                        </small>
                      )}
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
            <p className={styles.empty}>
              {products.length === 0
                ? '아직 상품이 없어요. 수불부를 올리면 상품이 생겨요.'
                : '검색 결과가 없어요.'}
            </p>
          )}
          {products.length === 0 && (
            <Button
              onClick={() => navigate('/upload')}
              type="button"
              variant="secondary"
            >
              수불부 올리기 →
            </Button>
          )}
        </section>
      </form>

      {/* 발주 팝업에도 form이 있어서, 입고 조건 form 밖에 둔다. form 안에 form이 있으면 저장이 페이지 새로고침이 된다. */}
      <PurchaseOrdersSection />

      {products.length > 0 && (
        <StorageCostSection
          products={products
            .filter((product) => product.isActive)
            .map(({ productId, name, barcode }) => ({
              productId,
              name,
              barcode,
            }))}
        />
      )}

      <footer className={styles.actions}>
        <Button
          onClick={() => navigate('/dashboard')}
          title="저장하지 않고 대시보드로 이동해요"
          type="button"
          variant="text"
        >
          ← 대시보드로
        </Button>
        {lock ? (
          <LockedButton>확인하고 계산하기</LockedButton>
        ) : (
          <Button
            disabled={products.length === 0 || calculationBusy}
            loading={isSubmitting}
            loadingLabel="계산 요청 중"
            form="inbound-settings-form"
            title={
              products.length === 0
                ? '상품이 있어야 계산할 수 있어요. 수불부를 먼저 올려 주세요'
                : undefined
            }
            type="submit"
          >
            확인하고 계산하기
          </Button>
        )}
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
