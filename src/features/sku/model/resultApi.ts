import { apiRequest } from '../../../shared/api/client'
import { dotDate } from '../../dashboard/model/dashboardApi'

// 계산 결과(resultId) 아래에 붙는 API. 주소와 응답은 팀 API 명세(docs/design/api-spec.docx) K2·K3·K4,
// 칸 이름은 ipgo-server ERD v1(scenario_results · ai_explanations)을 따른다.
// 서버에 아직 없는 주소라 지금은 MSW mock이 대답한다. 서버가 열리면 이 파일은 그대로 두고 연결만 바꾼다.

// K2 시나리오 한 줄 = scenario_results 한 행
export type ScenarioResult = {
  scenarioId: number
  type: 'P80' | 'P100' | 'P120' | 'CUSTOM'
  qty: number
  // 입고 단위로 올린 뒤 다른 시나리오와 수량이 같으면 true
  isDuplicate: boolean
  expectedDepletionOn: string | null
  expectedEndingStock: number
  // 못 판 양 합계(도착 전 + 도착 후). 화면은 쓰지 않고 server #85 뒤 지울 예정
  unmetDemandQty: number
  // 입고 뒤 못 판 양(server #85). 서버가 소수로 빼고 한 번만 올려서 보낸다
  postArrivalUnmetQty?: number | null
  // 0~1. 표본이 모자라거나 정확도 등급이 LOW면 null
  postArrivalRisk: number | null
}

export type ScenariosResponse = {
  resultId: number
  isEstimate: boolean
  // 도착 전 품절 위험은 주문 수량과 상관없어서 시나리오마다가 아니라 결과에 하나만 온다
  preArrivalRisk: number | null
  riskSampleSize: number | null
  riskStatus: 'OK' | 'INSUFFICIENT_SAMPLE' | 'LOW_GRADE'
  // 입고 전에 이미 못 파는 양. 입고량과 상관없어 결과에 하나만 온다(server #85)
  preArrivalUnmetQty?: number | null
  scenarios: ScenarioResult[]
}

// K4 AI 인사이트. 모양은 ipgo-ai docs/decisions/0002-insight-contract.md 3-7·4장(10/28)을 따른다.
// 명세(10/19)의 AI·FIXED·TABLE_ONLY는 0002에서 LLM·TEMPLATE·NONE으로 바뀌었다.
export type InsightResponse = {
  // LLM = AI 문장, TEMPLATE = 기본 문장(AI 실패·안 부름), NONE = 기본 문장도 못 만듦(비교표만)
  mode: 'LLM' | 'TEMPLATE' | 'NONE'
  explanationDisabled?: boolean
  generating?: boolean
  sentences: string[]
  state: 'NORMAL' | 'CHECK_NEEDED' | 'ON_HOLD' | 'NOT_NEEDED' | 'NOT_CALCULABLE'
  stateReason: string | null
  // 아는 사유는 LLM_ERROR · LLM_TIMEOUT · VALIDATION_FAILED. 서버가 다른 사유(VALUE_MISMATCH 등)를 보내도 그대로 받는다(ai#44 U2)
  failReason: string | null
  // 입고 조건을 바꿨는데 아직 다시 계산 전
  stale: boolean
}

// 화면이 쓰는 비교 카드 한 장
export type Scenario = {
  id: string
  label: string
  quantity: number
  expectedStockoutDate: string
  remainingAtNextInbound: number
  // 이 수량으로도 못 채우는 수요(재고 흐름 그래프가 쓴다)
  // 입고 뒤에 못 채우는 주문. 서버가 아직 안 보내면 null
  postArrivalUnmet: number | null
  // 화면은 % 정수
  preArrivalRisk: number | null
  postArrivalRisk: number | null
  estimated: boolean
  sampleSize: number
}

const LABEL = {
  P80: '권장량의 80%',
  P100: '권장량 100%',
  P120: '권장량의 120%',
  CUSTOM: '직접 입력',
} as const

const percent = (ratio: number | null) =>
  ratio === null ? null : Math.round(ratio * 100)

export function toScenario(
  item: ScenarioResult,
  shared: Pick<
    ScenariosResponse,
    'isEstimate' | 'preArrivalRisk' | 'riskSampleSize'
  >,
): Scenario {
  return {
    id: item.type === 'CUSTOM' ? `custom-${item.qty}` : item.type,
    label: LABEL[item.type],
    quantity: item.qty,
    expectedStockoutDate: dotDate(item.expectedDepletionOn),
    remainingAtNextInbound: item.expectedEndingStock,
    postArrivalUnmet: item.postArrivalUnmetQty ?? null,
    preArrivalRisk: percent(shared.preArrivalRisk),
    postArrivalRisk: percent(item.postArrivalRisk),
    estimated: shared.isEstimate,
    sampleSize: shared.riskSampleSize ?? 0,
  }
}

// 권장량(P100)과 같은 수량으로 겹친 80%·120% 카드는 빼고, 권장량이 0개면 비교표가 비어 있다(K3만 씀).
export function toScenarios(raw: ScenariosResponse) {
  return {
    preArrivalUnmet: raw.preArrivalUnmetQty ?? 0,
    recommendedQuantity:
      raw.scenarios.find((item) => item.type === 'P100')?.qty ?? 0,
    scenarios: raw.scenarios
      .filter((item) => !item.isDuplicate || item.type === 'P100')
      .map((item) => toScenario(item, raw)),
  }
}

// K2
export function getScenarios(resultId: number | string) {
  return apiRequest<ScenariosResponse>(`/results/${resultId}/scenarios`)
}

// K3 직접 입력. 결과 1건에 1개만 저장되고 새로 넣으면 이전 직접 입력을 덮어쓴다(명세 3.7).
export function addCustomScenario(resultId: number | string, qty: number) {
  return apiRequest<ScenarioResult>(`/results/${resultId}/scenarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qty }),
  })
}

// K4 서버 응답: 상태 이름이 아직 두 벌이고(0002: LLM·TEMPLATE·NONE / 명세·#24: AI·FIXED·TABLE_ONLY, ai#44 U1),
// 문장은 배열(sentences)이나 글 하나(draft)로 올 수 있다(U4). 화면이 쓰기 전에 한 모양으로 맞춘다.
export type InsightRaw = Omit<InsightResponse, 'mode' | 'sentences'> & {
  mode: string
  isFallback?: boolean
  text?: string | null
  sentences?: string[] | null
  draft?: string | null
}

const MODE: Record<string, InsightResponse['mode']> = {
  LLM: 'LLM',
  AI: 'LLM',
  TEMPLATE: 'TEMPLATE',
  FIXED: 'TEMPLATE',
  NONE: 'NONE',
  TABLE_ONLY: 'NONE',
}

export function toInsight(raw: InsightRaw): InsightResponse {
  const { draft, ...rest } = raw
  return {
    ...rest,
    // 모르는 이름이면 기본 문장으로 본다(AI 문장이라고 잘못 말하지 않게)
    mode: MODE[raw.mode] ?? 'TEMPLATE',
    explanationDisabled:
      raw.failReason === 'LLM_DISABLED' ||
      (raw.mode === 'TABLE_ONLY' &&
        raw.isFallback === false &&
        !raw.failReason),
    sentences:
      raw.sentences ??
      (draft ?? raw.text ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
  }
}

const FAIL_TEXT: Record<string, string> = {
  LLM_ERROR: 'AI 응답에 문제가 있었어요',
  LLM_TIMEOUT: 'AI 응답이 늦었어요',
  VALIDATION_FAILED: 'AI 문장이 검사를 통과하지 못했어요',
}

// 화면에 붙일 실패 사유 문구. 모르는 사유는 한 문구로 묶는다(전엔 "undefined"가 찍혔음)
export function failText(reason: string) {
  return FAIL_TEXT[reason] ?? 'AI 문장을 쓰지 못했어요'
}

export async function getInsight(resultId: number | string) {
  const raw = await apiRequest<InsightRaw | { status: 'GENERATING' }>(
    `/results/${resultId}/insight`,
  )
  if ('status' in raw && raw.status === 'GENERATING') {
    return {
      mode: 'NONE',
      generating: true,
      sentences: [],
      state: 'NORMAL',
      stateReason: null,
      failReason: null,
      stale: false,
    } satisfies InsightResponse
  }
  return toInsight(raw as InsightRaw)
}
