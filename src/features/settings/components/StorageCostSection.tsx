import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import {
  type Box,
  cbmOf,
  formatCbm,
  loadStorageSettings,
  positiveNumber,
  saveStorageSettings,
  STORAGE_ANCHOR,
  withCommas,
} from '../model/storageCost'
import styles from '../pages/SettingsPage.module.css'

type Product = { productId: number; name: string; barcode: string }

const SIDES = [
  ['width', '가로'],
  ['depth', '세로'],
  ['height', '높이'],
] as const

// 보관 비용(#185). 계산을 다시 돌릴 일이 아니라서 "확인하고 계산하기"와 따로, 칸을 벗어나면 바로 저장한다.
export function StorageCostSection({ products }: { products: Product[] }) {
  const [settings, setSettings] = useState(loadStorageSettings)
  const [drafts, setDrafts] = useState<Record<string, Partial<Box>>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
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

  function commit(next: typeof settings, label: string) {
    setSettings(next)
    setNotice(
      saveStorageSettings(next)
        ? `✓ ${label} 저장했어요`
        : '이 브라우저에 저장하지 못했어요',
    )
  }

  function saveRate(text: string) {
    if (text.trim() === '') {
      setError('rate', null)
      return commit({ ...settings, ratePerCbm: null }, '보관 요율')
    }
    const value = positiveNumber(text)
    if (value == null) return setError('rate', '0보다 큰 숫자로 넣어 주세요')
    setError('rate', null)
    commit({ ...settings, ratePerCbm: Math.round(value) }, '보관 요율')
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
    commit({ ...settings, boxes }, product.name)
  }

  const boxCount = products.filter(
    (product) => settings.boxes[String(product.productId)],
  ).length

  return (
    // 선택 항목이라 기본은 접어 둔다. 접혀 있어도 요율·입력한 상자 수는 한 줄로 보인다.
    <details
      className={`${styles.card} ${styles.fold}`}
      id={STORAGE_ANCHOR}
      ref={foldRef}
    >
      <summary aria-describedby="storage-cost-summary">
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
              onBlur={(event) => saveRate(event.target.value)}
              onChange={(event) => {
                event.target.value = withCommas(event.target.value)
              }}
              placeholder="미입력"
              type="text"
            />
            <b>원 / CBM·월</b>
          </div>
          <small role={errors.rate ? 'alert' : undefined}>
            {errors.rate ?? '계약서의 "CBM당 월 보관료"를 넣어 주세요'}
          </small>
        </label>
      </div>

      <div className={styles.useNote}>
        <p>상자 1개 크기를 cm로 넣으면 CBM으로 바꿔 드려요.</p>
        <span aria-live="polite" className={styles.savedNotice}>
          {notice}
        </span>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>상품</th>
              {SIDES.map(([side, label]) => (
                <th className={styles.numHead} key={side}>
                  {label}
                </th>
              ))}
              <th className={styles.numHead}>부피</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const key = String(product.productId)
              const box = settings.boxes[key]
              return (
                <tr key={key}>
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
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}
