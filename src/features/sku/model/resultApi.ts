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
  unmetDemandQty: number
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
  scenarios: ScenarioResult[]
}

// K4 AI 인사이트. 모양은 ipgo-ai docs/decisions/0002-insight-contract.md 3-7·4장(10/28)을 따른다.
// 명세(10/19)의 AI·FIXED·TABLE_ONLY는 0002에서 LLM·TEMPLATE·NONE으로 바뀌었다.
export type InsightResponse = {
  // LLM = AI 문장, TEMPLATE = 기본 문장(AI 실패·안 부름), NONE = 기본 문장도 못 만듦(비교표만)
  mode: 'LLM' | 'TEMPLATE' | 'NONE'
  sentences: string[]
  state: 'NORMAL' | 'CHECK_NEEDED' | 'ON_HOLD' | 'NOT_NEEDED' | 'NOT_CALCULABLE'
  stateReason: string | null
  failReason: 'LLM_ERROR' | 'LLM_TIMEOUT' | 'VALIDATION_FAILED' | null
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
    preArrivalRisk: percent(shared.preArrivalRisk),
    postArrivalRisk: percent(item.postArrivalRisk),
    estimated: shared.isEstimate,
    sampleSize: shared.riskSampleSize ?? 0,
  }
}

// 권장량(P100)과 같은 수량으로 겹친 80%·120% 카드는 빼고, 권장량이 0개면 비교표가 비어 있다(K3만 씀).
export function toScenarios(raw: ScenariosResponse) {
  return {
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

// K4
export function getInsight(resultId: number | string) {
  return apiRequest<InsightResponse>(`/results/${resultId}/insight`)
}
