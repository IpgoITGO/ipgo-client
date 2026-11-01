import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { planJiraSync, resolveJiraRepository } from './sync-routing.mjs'

const routing = JSON.parse(
  readFileSync(
    new URL('../../.github/jira-github-routing.json', import.meta.url),
    'utf8',
  ),
)
const repository = 'IpgoITGO/ipgo-client'
const autoCreateAfter = '2026-10-28T18:27:00+09:00'
const issue = (
  number,
  summary = '[화면] 새 작업',
  created = '2026-10-30T12:00:00+0900',
) => ({
  key: `IPGO-${number}`,
  fields: { summary, created },
})
const plan = (jiraIssues, options = {}) =>
  planJiraSync({
    jiraIssues,
    githubIssues: [],
    repository,
    projectKey: 'IPGO',
    routing,
    autoCreateAfter,
    autoCreateLimit: 5,
    ...options,
  })

test('화면·서버·AI·인프라 작업은 각각의 저장소로 분류한다', () => {
  for (const [summary, target] of [
    ['[화면] 로그인', 'client'],
    ['[서버] API', 'server'],
    ['[BE] 이메일', 'server'],
    ['[AI] 계산', 'ai'],
    ['[AI·DB] 계약', 'ai'],
    ['[AI worker] 정제', 'ai'],
    ['[인프라] 네트워크', 'infra'],
  ]) {
    assert.equal(
      resolveJiraRepository(issue(200, summary), routing),
      `IpgoITGO/ipgo-${target}`,
    )
  }
  for (const summary of [
    '[공통] 테스트',
    '[결정] 협의',
    '[통합] 점검',
    '분류 없음',
  ]) {
    assert.equal(resolveJiraRepository(issue(200, summary), routing), null)
  }
})

test('공통 작업은 명시한 목적지를 우선하며 보류 지정도 가능하다', () => {
  assert.equal(
    resolveJiraRepository(issue(98, '[결정] 인사이트 담당 협의'), routing),
    'IpgoITGO/ipgo-ai',
  )
  assert.equal(
    resolveJiraRepository(issue(111, '[통합] 검증'), routing),
    'IpgoITGO/ipgo-ai',
  )
  const custom = { ...routing, issueRepositories: { 'IPGO-200': null } }
  assert.equal(resolveJiraRepository(issue(200), custom), null)
  assert.equal(plan([issue(200)], { routing: custom }).create.length, 0)
})

test('다른 저장소와 미분류 후보는 클라이언트 생성 한도에 포함하지 않는다', () => {
  const result = plan(
    [
      issue(201),
      issue(202, '[서버] API'),
      issue(203, '[AI] 계산'),
      issue(204, '[공통] 회의'),
    ],
    { autoCreateLimit: 1 },
  )
  assert.deepEqual(
    result.create.map((x) => x.key),
    ['IPGO-201'],
  )
  assert.equal(result.creationBlocked, false)
  assert.deepEqual(
    result.skipped.map((x) => x.reason),
    ['other-repository', 'other-repository', 'manual-routing'],
  )
})

test('신규 생성 한도를 넘어도 기존 연결 작업은 모두 갱신 대상으로 남긴다', () => {
  const githubIssue = { number: 82, title: '[IPGO-64] 기존 서버 작업' }
  const result = plan(
    [
      issue(64, '[서버] 기존 작업'),
      ...Array.from({ length: 6 }, (_, i) => issue(201 + i)),
    ],
    { githubIssues: [githubIssue] },
  )
  assert.equal(result.existing.length, 1)
  assert.equal(result.existing[0].githubIssue, githubIssue)
  assert.equal(result.creationBlocked, true)
  assert.equal(result.create.length, 0)
  assert.equal(result.deferred.length, 6)
})

test('한도와 같으면 허용하며 0이면 신규 생성만 보류한다', () => {
  assert.equal(plan([issue(201)], { autoCreateLimit: 1 }).create.length, 1)
  assert.equal(plan([issue(201)], { autoCreateLimit: 0 }).deferred.length, 1)
  assert.equal(plan([], { autoCreateLimit: 0 }).creationBlocked, false)
})

test('기준 이전 작업은 생성하지 않고 제목의 명시적 연결만 인정한다', () => {
  const result = plan(
    [issue(201, '[화면] 이전 작업', '2026-10-28T18:26:00+0900'), issue(202)],
    {
      githubIssues: [
        { number: 1, title: '다른 작업', body: '관련 참고 IPGO-202' },
      ],
    },
  )
  assert.equal(result.skipped[0].reason, 'before-cutoff')
  assert.deepEqual(
    result.create.map((x) => x.key),
    ['IPGO-202'],
  )
})

test('잘못된 분류·한도·기준 시각은 실행 계획을 만들기 전에 거부한다', () => {
  for (const options of [
    { autoCreateLimit: -1 },
    { autoCreateLimit: NaN },
    { autoCreateLimit: 1.5 },
    { autoCreateAfter: '오늘' },
    { routing: {} },
    { repository: 'other/repo' },
    { routing: { ...routing, issueRepositories: { 'OTHER-1': repository } } },
    { routing: { ...routing, issueRepositories: { 'IPGO-1': 'other/repo' } } },
  ])
    assert.throws(() => plan([], options))
})

test('분류 규칙이 서로 다른 저장소를 가리키면 자동 생성하지 않는다', () => {
  const conflicting = structuredClone(routing)
  conflicting.rules.push({
    repository: 'IpgoITGO/ipgo-ai',
    summaryPrefixes: ['[화면]'],
  })
  assert.equal(
    plan([issue(201)], { routing: conflicting }).skipped[0].reason,
    'manual-routing',
  )
})

test('조회 페이지에 같은 Jira 작업이 중복돼도 한 번만 처리한다', () => {
  const result = plan([issue(201), issue(201), issue(77), issue(77)], {
    githubIssues: [{ number: 47, title: '[IPGO-77] 기존 작업' }],
    autoCreateLimit: 1,
  })
  assert.equal(result.existing.length, 1)
  assert.equal(result.create.length, 1)
  assert.equal(result.creationBlocked, false)
})
