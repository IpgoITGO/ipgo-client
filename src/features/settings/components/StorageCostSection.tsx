import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import {
  type Box,
  cbmOf,
  formatCbm,
  positiveNumber,
  saveBox,
  saveRate,
  STORAGE_ANCHOR,
  type StorageSettings,
  useStorageQuery,
  withCommas,
} from '../model/storageCost'
import styles from '../pages/SettingsPage.module.css'
import {
  keepSummaryInPlace,
  rememberSummary,
} from '../../../shared/ui/Fold/steadyFold'

type Product = { productId: number; name: string; barcode: string }

const SIDES = [
  ['width', '가로'],
  ['depth', '세로'],
  ['height', '높이'],
] as const

// 보관 비용(#185). 계산을 다시 돌릴 일이 아니라서 "확인하고 계산하기"와 따로, 칸을 벗어나면 바로 저장한다.
// 칸은 처음 값(defaultValue)으로 그리므로 서버 값을 받은 뒤에 연다. 못 받으면 빈 칸으로(선택 항목이라 막지 않음).
export function StorageCostSection({ products }: { products: Product[] }) {
  const query = useStorageQuery()
  if (!query.data && !query.isError) return null
  return (
    <StorageCostForm
      initial={query.data ?? { ratePerCbm: null, boxes: {} }}
      products={products}
    />
  )
}

function StorageCostForm({
  initial,
  products,
}: {
  initial: StorageSettings
  products: Product[]
}) {
  const client = useQueryClient()
  const [settings, setSettings] = useState(initial)
  const [drafts, setDrafts] = useState<Record<string, Partial<Box>>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  // 줄 지우기: 지운 값을 4초 동안 들고 있다가 "되돌리기"로 되살린다. rev가 바뀌면 그 줄 칸을 새로 그린다(빈칸으로)
  const [undo, setUndo] = useState<{
    key: string
    name: string
    box?: Box
    draft?: Partial<Box>
  } | null>(null)
  const [rev, setRev] = useState<Record<string, number>>({})
  // 규격이 같은 상품은 골라서 한 번에(11/11 — 289개를 줄마다 넣을 수는 없음)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [bulk, setBulk] = useState<Record<keyof Box, string>>({
    width: '',
    depth: '',
    height: '',
  })
  useEffect(() => {
    if (!undo) return
    const id = window.setTimeout(() => setUndo(null), 4000)
    return () => window.clearTimeout(id)
  }, [undo])
  const foldRef = useRef<HTMLDetailsElement>(null)
  const location = useLocation()

  // 대시보드·상품 상세의 "보관비 보기"로 오면(#storage-cost) 펼쳐서 이 칸으로 내려온다.
  useEffect(() => {
    const fold = foldRef.current
    if (location.hash !== '#' + STORAGE_ANCHOR || !fold) return
    fold.open = true
    const still = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches
    fold.scrollIntoView?.({
      behavior: still ? 'auto' : 'smooth',
      block: 'start',
    })
    fold.dataset.arrived = ''
    const id = window.setTimeout(() => delete fold.dataset.arrived, 1600)
    return () => window.clearTimeout(id)
  }, [location.hash, location.key])

  function setError(key: string, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev }
      if (message) next[key] = message
      else delete next[key]
      return next
    })
  }

  // 화면은 바로 바꾸고, 서버 저장 결과를 한 줄로 알린다. 끝나면 대시보드·상품 상세가 새 값을 다시 읽게 한다.
  function commit(
    next: StorageSettings,
    label: string,
    save: Promise<unknown>,
  ) {
    setSettings(next)
    setNotice('')
    save.then(
      () => setNotice(`✓ ${label} 저장했어요`),
      () => setNotice(`${label} 저장하지 못했어요. 잠시 뒤 다시 넣어 주세요`),
    )
    void save
      .catch(() => {})
      .finally(() => client.invalidateQueries({ queryKey: ['storage-cost'] }))
  }

  function onRate(text: string) {
    if (text.trim() === '') {
      setError('rate', null)
      return commit(
        { ...settings, ratePerCbm: null },
        '보관 요율',
        saveRate(null),
      )
    }
    const value = positiveNumber(text)
    if (value == null) return setError('rate', '0보다 큰 숫자로 넣어 주세요')
    setError('rate', null)
    const rate = Math.round(value)
    commit({ ...settings, ratePerCbm: rate }, '보관 요율', saveRate(rate))
  }

  function saveSide(product: Product, side: keyof Box, text: string) {
    const key = String(product.productId)
    const value = positiveNumber(text)
    if (text.trim() !== '' && value == null) {
      return setError(key, '0보다 큰 숫자로 넣어 주세요')
    }
    setError(key, null)
    // 칸을 하나씩 채우는 동안의 값은 drafts에 모으고, 세 칸이 다 차야 상자 크기로 저장한다.
    const draft: Partial<Box> = { ...settings.boxes[key], ...drafts[key] }
    if (value == null) delete draft[side]
    else draft[side] = value
    setDrafts((prev) => ({ ...prev, [key]: draft }))
    const complete = Boolean(draft.width && draft.depth && draft.height)
    const had = Boolean(settings.boxes[key])
    if (!complete && !had) return
    const boxes = { ...settings.boxes }
    if (complete) boxes[key] = draft as Box
    else delete boxes[key]
    commit(
      { ...settings, boxes },
      product.name,
      saveBox(key, complete ? (draft as Box) : null),
    )
  }

  const bump = (key: string) =>
    setRev((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }))

  // 한 줄의 세 칸을 한 번에 비운다(#255)
  function clearRow(product: Product) {
    const key = String(product.productId)
    const boxes = { ...settings.boxes }
    const box = boxes[key]
    delete boxes[key]
    const draft = drafts[key]
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setError(key, null)
    setSettings({ ...settings, boxes })
    setNotice('')
    if (box)
      void saveBox(key, null).then(
        () => client.invalidateQueries({ queryKey: ['storage-cost'] }),
        () =>
          setNotice(
            `${product.name} 지우지 못했어요. 잠시 뒤 다시 눌러 주세요`,
          ),
      )
    setUndo({ key, name: product.name, box, draft })
    bump(key)
  }

  function undoClear() {
    if (!undo) return
    const boxes = { ...settings.boxes }
    if (undo.box) boxes[undo.key] = undo.box
    if (undo.draft) setDrafts((prev) => ({ ...prev, [undo.key]: undo.draft! }))
    // 세 칸이 다 찬 상자만 서버에 있었으니 그것만 되살린다(덜 채운 칸은 화면에만)
    if (undo.box)
      commit({ ...settings, boxes }, undo.name, saveBox(undo.key, undo.box))
    bump(undo.key)
    setUndo(null)
  }

  const shown = products.filter((product) =>
    `${product.name} ${product.barcode}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )
  const shownKeys = shown.map((product) => String(product.productId))
  const allShownPicked =
    shownKeys.length > 0 && shownKeys.every((key) => picked.has(key))
  function togglePick(key: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function pickShown(checked: boolean) {
    setPicked((prev) => {
      const next = new Set(prev)
      shownKeys.forEach((key) => (checked ? next.add(key) : next.delete(key)))
      return next
    })
  }
  // 고른 상품 모두에 같은 상자 크기를 넣고 한 번에 저장한다
  function applyBulk() {
    const width = positiveNumber(bulk.width)
    const depth = positiveNumber(bulk.depth)
    const height = positiveNumber(bulk.height)
    if (!width || !depth || !height) {
      return setError('bulk', '가로·세로·높이를 0보다 큰 숫자로 다 넣어 주세요')
    }
    const box: Box = { width, depth, height }
    const keys = [...picked]
    const boxes = { ...settings.boxes }
    keys.forEach((key) => (boxes[key] = box))
    setDrafts((prev) => {
      const next = { ...prev }
      keys.forEach((key) => delete next[key])
      return next
    })
    setErrors((prev) => {
      const next = { ...prev }
      keys.forEach((key) => delete next[key])
      delete next.bulk
      return next
    })
    commit(
      { ...settings, boxes },
      `상품 ${keys.length}개 상자 크기`,
      Promise.all(keys.map((key) => saveBox(key, box))),
    )
    setRev((prev) => {
      const next = { ...prev }
      keys.forEach((key) => (next[key] = (next[key] ?? 0) + 1))
      return next
    })
    setPicked(new Set())
  }

  const boxCount = products.filter(
    (product) => settings.boxes[String(product.productId)],
  ).length

  return (
    // 선택 항목이라 기본은 접어 둔다. 접혀 있어도 요율·입력한 상자 수는 한 줄로 보인다.
    <details
      className={`${styles.card} ${styles.fold}`}
      id={STORAGE_ANCHOR}
      onToggle={keepSummaryInPlace}
      ref={foldRef}
    >
      <summary
        aria-describedby="storage-cost-summary"
        onClick={rememberSummary}
      >
        <span className={styles.foldTitle}>
          <h2 id="storage-cost-title">보관 비용</h2>
          <span className={styles.optional}>선택</span>
        </span>
        <span className={styles.foldSummary} id="storage-cost-summary">
          {settings.ratePerCbm == null && boxCount === 0
            ? '넣으면 권장 입고량의 한 달 보관비를 보여 줘요'
            : `요율 ${settings.ratePerCbm == null ? '미입력' : `${settings.ratePerCbm.toLocaleString('ko-KR')}원`} · 상자 크기 ${boxCount}/${products.length}개`}
        </span>
        <svg aria-hidden="true" className={styles.foldIcon} viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <p className={styles.foldLead}>
        상자 크기와 창고 요율을 넣으면 권장 입고량의 한 달 보관비를 보여 줘요.
        칸을 벗어나면 바로 저장돼요.
      </p>

      <div className={styles.defaultGrid}>
        <label>
          <span>창고 보관 요율</span>
          <div>
            <input
              aria-invalid={Boolean(errors.rate)}
              aria-label="창고 보관 요율"
              className={styles.rateInput}
              defaultValue={settings.ratePerCbm?.toLocaleString('ko-KR') ?? ''}
              id="storage-rate"
              inputMode="numeric"
              onBlur={(event) => onRate(event.target.value)}
              onChange={(event) => {
                event.target.value = withCommas(event.target.value)
              }}
              placeholder="예: 30,000"
              type="text"
            />
            <b>원 / CBM·월</b>
          </div>
          <small role={errors.rate ? 'alert' : undefined}>
            {errors.rate ?? '계약서의 "CBM당 월 보관료"를 넣어 주세요'}
          </small>
        </label>
      </div>

      {/* 위 "상품별로 다른 조건"처럼 왼쪽은 할 일, 오른쪽 끝에 검색 */}
      <div className={`${styles.sectionHeader} ${styles.bulkHead}`}>
        {/* 자리를 늘 잡아 두어 고르기 시작해도 표가 밀리지 않는다 */}
        <div
          aria-label="고른 상품에 같은 크기 넣기"
          className={styles.bulkBar}
          data-off={picked.size === 0 || undefined}
          role="group"
        >
          <b>
            {picked.size > 0
              ? `${picked.size}개 고름`
              : '같은 규격은 골라서 한 번에'}
          </b>
          {SIDES.map(([side, label]) => (
            <span className={styles.numField} key={side}>
              <input
                aria-label={`고른 상품 상자 ${label}`}
                disabled={picked.size === 0}
                inputMode="decimal"
                onChange={(event) =>
                  setBulk((prev) => ({ ...prev, [side]: event.target.value }))
                }
                placeholder={label}
                type="text"
                value={bulk[side]}
              />
              <b>cm</b>
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
          {errors.bulk && <small role="alert">{errors.bulk}</small>}
        </div>
        <input
          aria-label="보관 비용 상품 검색"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="상품명 · 바코드 검색"
          type="search"
          value={search}
        />
      </div>

      <div className={styles.useNote}>
        <p>상자 1개 크기를 cm로 넣으면 CBM으로 바꿔 드려요.</p>
        <span aria-live="polite" className={styles.savedNotice}>
          {undo ? (
            <>
              {undo.name} 상자 크기를 지웠어요{' '}
              <button
                className={styles.undoLink}
                onClick={undoClear}
                type="button"
              >
                되돌리기
              </button>
            </>
          ) : (
            notice
          )}
        </span>
      </div>

      <div className={styles.tableWrap}>
        {/* 칸 폭을 고정해 부피가 채워져도 가로·세로·높이 칸이 밀리지 않게(#255) */}
        <table className={styles.boxTable}>
          <colgroup>
            <col className={styles.pickCol} />
            <col />
            <col className={styles.sideCol} />
            <col className={styles.sideCol} />
            <col className={styles.sideCol} />
            <col className={styles.volCol} />
            <col className={styles.clearCol} />
          </colgroup>
          <thead>
            <tr>
              <th>
                <input
                  aria-label="보관 비용 보이는 상품 모두 고르기"
                  checked={allShownPicked}
                  className={styles.pickBox}
                  onChange={(event) => pickShown(event.target.checked)}
                  type="checkbox"
                />
              </th>
              <th>상품</th>
              {SIDES.map(([side, label]) => (
                <th className={styles.numHead} key={side}>
                  {label}
                </th>
              ))}
              <th className={styles.numHead}>부피</th>
              <th>
                <span className={styles.srOnly}>지우기</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((product) => {
              const key = String(product.productId)
              const box = settings.boxes[key]
              const hasAny =
                Boolean(box) || Object.keys(drafts[key] ?? {}).length > 0
              return (
                <tr
                  data-picked={picked.has(key) || undefined}
                  key={`${key}-${rev[key] ?? 0}`}
                >
                  <td>
                    <input
                      aria-label={`${product.name} 상자 고르기`}
                      checked={picked.has(key)}
                      className={styles.pickBox}
                      onChange={() => togglePick(key)}
                      type="checkbox"
                    />
                  </td>
                  <td className={styles.nameCell}>
                    <strong>{product.name}</strong>
                    <span>{product.barcode}</span>
                  </td>
                  {SIDES.map(([side, label]) => (
                    <td className={styles.numCell} key={side}>
                      <span className={styles.numField}>
                        <input
                          aria-label={`${product.name} 상자 ${label}`}
                          defaultValue={box?.[side] ?? ''}
                          inputMode="decimal"
                          onBlur={(event) =>
                            saveSide(product, side, event.target.value)
                          }
                          placeholder="—"
                          type="text"
                        />
                        <b>cm</b>
                      </span>
                    </td>
                  ))}
                  <td className={styles.numCell}>
                    {errors[key] ? (
                      <small role="alert">{errors[key]}</small>
                    ) : box ? (
                      <span className={styles.cbm}>
                        {formatCbm(cbmOf(box))} CBM
                      </span>
                    ) : (
                      <span className={styles.cbmEmpty}>미입력</span>
                    )}
                  </td>
                  <td className={styles.clearCell}>
                    {hasAny && (
                      <button
                        aria-label={`${product.name} 상자 크기 지우기`}
                        className={styles.rowClear}
                        onClick={() => clearRow(product)}
                        title="이 줄 지우기"
                        type="button"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <path d="M7 7l10 10M17 7L7 17" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className={styles.empty}>검색 결과가 없어요.</p>
        )}
      </div>
    </details>
  )
}
