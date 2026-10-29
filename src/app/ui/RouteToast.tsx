import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Toast } from '../../shared/ui/Toast/Toast'

/**
 * 다른 화면에서 `navigate(path, { state: { toast: '문구' } })`로 넘긴 안내를 보여 준다.
 * 새로고침하거나 뒤로 가도 다시 뜨지 않도록, 읽은 뒤 history 상태를 비운다.
 */
export function RouteToast() {
  const location = useLocation()
  const navigate = useNavigate()
  const incoming = (location.state as { toast?: string } | null)?.toast
  const [shown, setShown] = useState<{ key: string; message: string } | null>(
    null,
  )
  const close = useCallback(() => setShown(null), [])

  // 이동할 때마다 새 key가 생기므로, 같은 이동의 안내는 한 번만 받아 둔다.
  if (incoming && shown?.key !== location.key) {
    setShown({ key: location.key, message: incoming })
  }

  useEffect(() => {
    if (incoming) {
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      })
    }
  }, [incoming, location.pathname, location.search, navigate])

  return shown ? <Toast message={shown.message} onClose={close} /> : null
}
