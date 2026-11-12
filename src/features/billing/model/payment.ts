import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { openCardWindow } from './cardWindow'
import {
  billingPost,
  cancelRegistration,
  newIdempotencyKey,
  plansQuery,
  type RegistrationSession,
} from './billingApi'

// 결제사가 돌려주는 사유를 우리 말로. 모르는 사유는 한 문장으로 묶는다.
const REASONS: Record<string, string> = {
  LIMIT_EXCEEDED: '카드 한도가 부족해요',
  INVALID_CARD: '카드 정보가 맞지 않아요',
  EXPIRED_CARD: '유효 기간이 지난 카드예요',
  NETWORK: '결제사와 연결이 끊겼어요',
  USER_CANCEL: '결제창을 닫았어요',
}

export function reasonText(code: string | null | undefined) {
  return (code && REASONS[code]) || '결제사에서 결제를 거절했어요'
}

// 다시 시도를 누르면 돌아갈 화면(결제창에서 돌아오면 어디서 시작했는지 잃기 때문)
const RETURN_KEY = 'ipgo:billing-return'
function rememberReturn(path: string) {
  try {
    sessionStorage.setItem(RETURN_KEY, path)
  } catch {
    // 못 적어도 요금제 화면으로 가면 된다.
  }
}
export function returnPath() {
  try {
    return sessionStorage.getItem(RETURN_KEY) ?? '/plans'
  } catch {
    return '/plans'
  }
}

// 카드 등록 시작(처음 결제 = START_SUBSCRIPTION, 카드 바꾸기 = REPLACE_METHOD). 누를 때마다 새 키를 쓴다.
// 열린 같은 시도는 서버가 새 키여도 이어받고(server #189), 같은 키는 처음 결과를 돌려주므로 키를 저장하지 않는다(11/12 검수).
export function useCardRegistration(who: { email?: string; name?: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async (
    purpose: 'START_SUBSCRIPTION' | 'REPLACE_METHOD',
    planId?: string,
  ) => {
    const plans = await queryClient.ensureQueryData(plansQuery)
    const plan = plans.find((p) => p.planId === planId)
    const consentVersion = (plan ?? plans[0]).consentVersion
    const body =
      purpose === 'START_SUBSCRIPTION'
        ? { purpose, planId, priceVersion: plan?.priceVersion, consentVersion }
        : { purpose, consentVersion }
    const session = await billingPost<RegistrationSession>(
      '/registration-sessions',
      newIdempotencyKey(),
      body,
    ).catch(async (error: unknown) => {
      // 요금이 바뀐 경우 새 요금을 다시 받아 둔다.
      await queryClient.invalidateQueries({ queryKey: plansQuery.queryKey })
      throw error
    })
    rememberReturn(
      purpose === 'START_SUBSCRIPTION'
        ? `/checkout?plan=${planId}`
        : '/account',
    )
    const opened = await openCardWindow(session, who)
    if (opened && typeof opened === 'object') {
      navigate(opened.redirect)
      return
    }
    // 결제창을 직접 닫은 것만 확실한 "그만둠"이라 이 시도를 닫는다. 실패해도 15분 뒤 저절로 만료된다
    if (opened === 'cancelled') {
      void cancelRegistration(session.sessionId).catch(() => undefined)
    }
    return opened
  }
}
