import { env } from '../../../shared/config/env'
import type { RegistrationSession } from './billingApi'

type TossWindow = Window & {
  TossPayments?: (key: string) => {
    payment: (opts: { customerKey: string }) => {
      requestBillingAuth: (opts: Record<string, string>) => Promise<void>
    }
  }
}

let sdk: Promise<void> | null = null
function loadToss() {
  sdk ??= new Promise<void>((resolve, reject) => {
    if ((window as TossWindow).TossPayments) return resolve()
    const script = document.createElement('script')
    script.src = 'https://js.tosspayments.com/v2/standard'
    script.onload = () => resolve()
    script.onerror = () => {
      sdk = null
      reject(new Error('결제창을 불러오지 못했어요. 다시 시도해 주세요'))
    }
    document.head.append(script)
  })
  return sdk
}

// 카드 등록 창을 연다. 열리면 화면이 결제사로 넘어가 돌아오지 않는다. 사용자가 닫으면 'cancelled'.
export async function openCardWindow(
  session: RegistrationSession,
  who: { email?: string; name?: string },
) {
  const clientKey = env.tossClientKey
  if (!clientKey) {
    if (!env.enableMsw) {
      // 개발용 이름(VITE_TOSS_CLIENT_KEY)은 셀러에게 보이지 않게 콘솔에만(11/12)
      console.error('VITE_TOSS_CLIENT_KEY가 비어 있어 결제창을 열 수 없어요')
      throw new Error(
        '결제창을 열 준비가 아직 안 됐어요. 잠시 뒤 다시 해 주세요',
      )
    }
    // 가짜 서버로 볼 때: 결제사 없이 바로 돌아온 것처럼. 페이지를 새로 불러오면 가짜 서버가 기억하던
    // 세션이 사라지므로 주소 경로만 넘겨 앱 안에서 이동한다(부르는 쪽이 navigate)
    const back = new URL(session.successUrl, window.location.origin)
    back.searchParams.set('authKey', 'mock_auth')
    back.searchParams.set('customerKey', session.customerKey)
    return { redirect: `${back.pathname}${back.search}` }
  }
  await loadToss()
  try {
    await (window as TossWindow).TossPayments!(clientKey)
      .payment({ customerKey: session.customerKey })
      .requestBillingAuth({
        method: 'CARD',
        successUrl: session.successUrl,
        failUrl: session.failUrl,
        ...(who.email ? { customerEmail: who.email } : {}),
        ...(who.name ? { customerName: who.name } : {}),
      })
  } catch (error) {
    if ((error as { code?: string }).code === 'USER_CANCEL') return 'cancelled'
    throw error
  }
}
