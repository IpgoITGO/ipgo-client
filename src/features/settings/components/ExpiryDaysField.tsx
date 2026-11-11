import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  saveExpirySettings,
  useExpirySettings,
} from '../../expiry/model/expiryApi'

// 입고 조건 "모든 상품 기본값"의 네 번째 상자: 유통기한이 며칠 남으면 "임박"으로 볼지(ipgo-server#169, 기본 30일).
// 계산을 다시 돌릴 일이 아니라서 "확인하고 계산하기"와 따로, 칸을 벗어나면 바로 저장한다(보관 비용과 같은 방식).
// 서버가 아직 이 API를 안 주면(404 등) 기본 30일로 보여 주고 저장 실패를 한 줄로 알린다.
export function ExpiryDaysField() {
  const query = useExpirySettings()
  const client = useQueryClient()
  const saved = query.data?.imminentDays ?? 30
  const [text, setText] = useState<string | null>(null)
  const [note, setNote] = useState<{ tone?: 'error'; text: string } | null>(
    null,
  )

  async function save() {
    if (text == null) return
    const days = Number(text)
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setNote({ tone: 'error', text: '1~365일로 넣어 주세요' })
      return
    }
    if (days === saved) {
      setText(null)
      return
    }
    try {
      await saveExpirySettings(days)
      setNote({ text: `✓ ${days}일로 저장했어요` })
      setText(null)
      // 대시보드 유통기한 칸·알림이 새 기준으로 다시 읽게
      await Promise.all([
        client.invalidateQueries({ queryKey: ['expiry-settings'] }),
        client.invalidateQueries({ queryKey: ['expiry'] }),
      ])
    } catch {
      setNote({
        tone: 'error',
        text: '저장하지 못했어요. 잠시 뒤 다시 넣어 주세요',
      })
    }
  }

  return (
    <label>
      <span>유통기한 임박</span>
      <div>
        <input
          aria-invalid={note?.tone === 'error'}
          aria-label="유통기한 임박 기준"
          inputMode="numeric"
          onBlur={() => void save()}
          onChange={(event) => {
            setNote(null)
            setText(event.target.value.replace(/\D/g, '').slice(0, 3))
          }}
          type="text"
          value={text ?? String(saved)}
        />
        <b>일 전</b>
      </div>
      <small role={note?.tone === 'error' ? 'alert' : undefined}>
        {note?.text ?? '남은 날이 이만큼이면 알림과 대시보드에 알려요'}
      </small>
    </label>
  )
}
