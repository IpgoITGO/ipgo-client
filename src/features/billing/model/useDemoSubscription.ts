import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

import { env } from '../../../shared/config/env'
import { DEMO_STATES, demoSubscription, saveSubscription } from './billing'

type DemoState = (typeof DEMO_STATES)[number]

// 가짜 서버로 볼 때만: ?demo=trial-ended 같은 주소로 들어오면 그 구독 상태를 저장한다(예외 화면 확인용).
export function useDemoSubscription() {
  const [params] = useSearchParams()
  const demo = env.enableMsw ? params.get('demo') : null
  useEffect(() => {
    if (demo && (DEMO_STATES as readonly string[]).includes(demo)) {
      saveSubscription(demoSubscription(demo as DemoState))
    }
  }, [demo])
}
