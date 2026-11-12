import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { openCardWindow } from './cardWindow'
import { ApiError } from '../../../shared/api/client'
import {
  billingPost,
  cancelRegistration,
  newIdempotencyKey,
  plansQuery,
  type RegistrationSession,
} from './billingApi'

// 등록 요청 키는 같은 사람·같은 목적/요금제면 화면을 다시 열어도 이어받는다(#294). 새로고침·재진입에도 같은 시도로 묶이게
// 탭 저장소에 둔다. authKey·카드 정보·시크릿은 저장하지 않는다. 로그아웃하면 지운다(clearBillingKeys).
const KEY_PREFIX = 'ipgo:billing-key:'
function storedKey(slot: string) {
  try {
    return sessionStorage.getItem(KEY_PREFIX + slot)
  } catch {
    return null
  }
}
function storeKey(slot: string, key: string | null) {
  try {
    if (key) sessionStorage.setItem(KEY_PREFIX + slot, key)
    else sessionStorage.removeItem(KEY_PREFIX + slot)
  } catch {
    /* 못 적으면 이번 화면에서만 이어받는다 */
  }
}
export function clearBillingKeys() {
  try {
    Object.keys(sessionStorage)
      .filter((name) => name.startsWith(KEY_PREFIX))
      .forEach((name) => sessionStorage.removeItem(name))
  } catch {
    /* 탭 저장소를 못 쓰면 지울 것도 없다 */
  }
}

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

// 카드 등록 시작(처음 결제 = START_SUBSCRIPTION, 카드 바꾸기 = REPLACE_METHOD).
// 같은 동작을 다시 보낼 때는 같은 키를 쓰고, 다른 동작이면 새 키를 쓴다.
// 이전 키가 취소·만료된 시도면(BILLING_SESSION_CANCELED/EXPIRED) 그때만 새 키로 한 번 다시 연다(server #189).
export function useCardRegistration(who: { email?: string; name?: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async (
    purpose: 'START_SUBSCRIPTION' | 'REPLACE_METHOD',
    planId?: string,
  ) => {
    const plans = await queryClient.ensureQueryData(plansQuery)
    const plan = plans.find((p) => p.planId === planId)
    const slot = `${who.email ?? ''}:${purpose}:${planId ?? ''}`
    const consentVersion = (plan ?? plans[0]).consentVersion
    const body =
      purpose === 'START_SUBSCRIPTION'
        ? { purpose, planId, priceVersion: plan?.priceVersion, consentVersion }
        : { purpose, consentVersion }
    const register = (key: string) => {
      storeKey(slot, key)
      return billingPost<RegistrationSession>(
        '/registration-sessions',
        key,
        body,
      )
    }
    const session = await register(storedKey(slot) ?? newIdempotencyKey())
      .catch((error: unknown) => {
        const ended =
          error instanceof ApiError &&
          (error.code === 'BILLING_SESSION_CANCELED' ||
            error.code === 'BILLING_SESSION_EXPIRED')
        if (ended) return register(newIdempotencyKey())
        throw error
      })
      .catch(async (error: unknown) => {
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
      storeKey(slot, null)
      void cancelRegistration(session.sessionId).catch(() => undefined)
    }
    return opened
  }
}
