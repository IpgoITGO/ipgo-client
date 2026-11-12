import { type FormEvent, useId, useState } from 'react'

import { PasswordField } from '../../../auth/components/PasswordField'
import { PasswordStrength } from '../../../auth/components/PasswordStrength'
import { PASSWORD_RULE } from '../../../auth/model/passwordRule'
import { ApiError, apiRequest } from '../../../shared/api/client'
import { useActionLock } from '../../../shared/hooks/useActionLock'
import { Button } from '../../../shared/ui/Button/Button'
import { Modal } from '../../../shared/ui/Modal/Modal'
import styles from './PasswordChangeModal.module.css'

type Field = 'current' | 'next' | 'confirm'

// 로그인한 채로 비밀번호 바꾸기(server #194). 바꾸면 이 화면은 그대로, 다른 기기는 로그아웃된다.
export function PasswordChangeModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: () => void
}) {
  const titleId = useId()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<{ field: Field; text: string }>()

  const save = useActionLock(async () => {
    setError(undefined)
    if (!current)
      return setError({
        field: 'current',
        text: '지금 비밀번호를 입력해 주세요.',
      })
    if (!PASSWORD_RULE.test(next))
      return setError({ field: 'next', text: '아래 조건을 모두 채워 주세요.' })
    if (next !== confirm)
      return setError({ field: 'confirm', text: '새 비밀번호가 서로 달라요.' })
    try {
      await apiRequest<void>('/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      onDone()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'WRONG_PASSWORD')
        setError({ field: 'current', text: '지금 비밀번호가 맞지 않아요.' })
      else if (e instanceof ApiError && e.code === 'INVALID_INPUT')
        setError({ field: 'next', text: '아래 조건을 모두 채워 주세요.' })
      else
        setError({
          field: 'confirm',
          text:
            e instanceof ApiError ? e.message : '비밀번호를 바꾸지 못했어요.',
        })
    }
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    void save.run()
  }
  const errorOf = (field: Field) =>
    error?.field === field ? error.text : undefined

  return (
    <Modal labelledBy={titleId} onClose={onClose}>
      <form className={styles.body} noValidate onSubmit={submit}>
        <h2 className={styles.title} id={titleId}>
          비밀번호 바꾸기
        </h2>
        <PasswordField
          autoComplete="current-password"
          autoFocus
          error={errorOf('current')}
          label="지금 비밀번호"
          onChange={(e) => setCurrent(e.target.value)}
          value={current}
        />
        <PasswordField
          autoComplete="new-password"
          error={errorOf('next')}
          hint={<PasswordStrength value={next} />}
          label="새 비밀번호"
          onChange={(e) => setNext(e.target.value)}
          value={next}
        />
        <PasswordField
          autoComplete="new-password"
          error={errorOf('confirm')}
          label="새 비밀번호 확인"
          onChange={(e) => setConfirm(e.target.value)}
          value={confirm}
        />
        <p className={styles.note}>
          바꾸면 이 화면은 그대로이고, 다른 기기에서는 로그아웃돼요.
        </p>
        <div className={styles.actions}>
          <Button onClick={onClose} type="button" variant="secondary">
            그만두기
          </Button>
          <Button
            loading={save.isPending}
            loadingLabel="바꾸는 중"
            type="submit"
          >
            바꾸기
          </Button>
        </div>
      </form>
    </Modal>
  )
}
