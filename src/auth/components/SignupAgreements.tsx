import { useId, useState } from 'react'
import { Link } from 'react-router-dom'

import type { SignupPolicy } from '../../features/legal/model/signupPolicy'
import { Button } from '../../shared/ui/Button/Button'
import { Modal } from '../../shared/ui/Modal/Modal'
import styles from './SignupAgreements.module.css'

export type AgreementChecks = { terms: boolean; privacy: boolean }

export function SignupAgreements({
  policy,
  value,
  onChange,
}: {
  policy: SignupPolicy
  value: AgreementChecks
  onChange: (value: AgreementChecks) => void
}) {
  const titleId = useId()
  const [document, setDocument] = useState<'terms' | 'privacyConsent' | null>(
    null,
  )
  return (
    <fieldset className={styles.agreements}>
      <legend>약관 동의</legend>
      <label>
        <input
          type="checkbox"
          checked={value.terms && value.privacy}
          onChange={(event) =>
            onChange({
              terms: event.target.checked,
              privacy: event.target.checked,
            })
          }
        />
        전체 동의
      </label>
      {(
        [
          ['terms', '이용약관 동의 (필수)', '이용약관 전문 보기'],
          [
            'privacy',
            '개인정보 수집·이용 동의 (필수)',
            '수집·이용 동의서 전문 보기',
          ],
        ] as const
      ).map(([key, label, view]) => (
        <div className={styles.row} key={key}>
          <label>
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(event) =>
                onChange({ ...value, [key]: event.target.checked })
              }
            />
            {label}
          </label>
          <Button
            type="button"
            variant="text"
            onClick={() =>
              setDocument(key === 'terms' ? 'terms' : 'privacyConsent')
            }
          >
            {view}
          </Button>
        </div>
      ))}
      {document && (
        <Modal labelledBy={titleId} onClose={() => setDocument(null)} wide>
          <h2 id={titleId}>
            {document === 'terms' ? '이용약관' : '개인정보 수집·이용 동의서'}
          </h2>
          <p>문서 버전: {policy.version}</p>
          <div className={styles.document}>{policy[document]}</div>
          {document === 'privacyConsent' && (
            <p>
              <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                개인정보 처리방침 전체 보기
              </Link>
            </p>
          )}
          <Button type="button" onClick={() => setDocument(null)}>
            닫기
          </Button>
        </Modal>
      )}
    </fieldset>
  )
}
