import { useId } from 'react'
import type { RefundAccount } from '../../billing/model/billingApi'
import styles from './RefundAccountFields.module.css'

const banks = [
  ['04', '국민은행'],
  ['88', '신한은행'],
  ['20', '우리은행'],
  ['81', '하나은행'],
  ['11', '농협은행'],
  ['03', '기업은행'],
  ['90', '카카오뱅크'],
  ['89', '케이뱅크'],
  ['92', '토스뱅크'],
  ['02', '산업은행'],
  ['07', '수협은행'],
  ['23', 'SC제일은행'],
  ['27', '한국씨티은행'],
  ['31', 'iM뱅크'],
  ['32', '부산은행'],
  ['34', '광주은행'],
  ['35', '제주은행'],
  ['37', '전북은행'],
  ['39', '경남은행'],
  ['45', '새마을금고'],
  ['48', '신협'],
  ['50', '저축은행'],
  ['64', '산림조합'],
  ['71', '우체국'],
] as const

export function RefundAccountFields({
  value,
  onChange,
  disabled,
}: {
  value: RefundAccount
  onChange: (next: RefundAccount) => void
  disabled: boolean
}) {
  const id = useId()
  return (
    <fieldset className={styles.fields} disabled={disabled}>
      <legend>환불받을 계좌</legend>
      <p>
        본인 명의 계좌를 입력해 주세요. 은행 처리 중에는 환불 완료로 표시하지
        않아요.
      </p>
      <div>
        <label htmlFor={`${id}-bank`}>환불 은행</label>
        <select
          id={`${id}-bank`}
          required
          value={value.bank}
          onChange={(e) => onChange({ ...value, bank: e.target.value })}
        >
          <option value="">은행을 선택해 주세요</option>
          {banks.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-account`}>환불 계좌번호</label>
        <input
          id={`${id}-account`}
          required
          autoComplete="off"
          inputMode="numeric"
          maxLength={20}
          value={value.accountNumber}
          onChange={(e) =>
            onChange({
              ...value,
              accountNumber: e.target.value.replace(/[\s-]/g, ''),
            })
          }
        />
      </div>
      <div>
        <label htmlFor={`${id}-holder`}>예금주명</label>
        <input
          id={`${id}-holder`}
          required
          autoComplete="off"
          maxLength={60}
          value={value.holderName}
          onChange={(e) => onChange({ ...value, holderName: e.target.value })}
        />
      </div>
    </fieldset>
  )
}
