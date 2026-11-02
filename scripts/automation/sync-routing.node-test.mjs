import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  canSyncGithubIssue,
  isJiraKeySyncEnabled,
  planJiraSync,
  releaseJiraKeys,
  resolveJiraRepository,
} from './sync-routing.mjs'

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
  assert.equal(resolveJiraRepository(issue(111, '[통합] 검증'), routing), null)
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
  const githubIssue = { number: 47, title: '[IPGO-77] 기존 Client 작업' }
  const result = plan(
    [
      issue(77, '[화면] 기존 작업'),
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

test('Jira 전용·서버 미러는 닫혀 있어도 기존 갱신·신규 생성에서 제외한다', () => {
  const result = plan([issue(47, '[공통] Scrum'), issue(80, '[서버] 업로드')], {
    githubIssues: [
      { number: 59, title: '[IPGO-47] Scrum', state: 'closed' },
      { number: 101, title: '[IPGO-80] 업로드', state: 'closed' },
    ],
  })
  assert.equal(result.existing.length, 0)
  assert.equal(result.create.length, 0)
  assert.deepEqual(
    result.skipped.map((x) => x.reason),
    ['jira-only', 'canonical-reference'],
  )
})

test('참조 정본은 제목에 키가 없어도 미러를 새로 만들거나 상태를 쓰지 않는다', () => {
  const result = plan([issue(73)], {
    githubIssues: [{ number: 39, title: '기존 탭 제목 구현', state: 'closed' }],
  })
  assert.equal(result.create.length, 0)
  assert.equal(result.existing.length, 0)
  assert.equal(
    canSyncGithubIssue(
      { number: 39, title: '[IPGO-73] 원본' },
      'IPGO-73',
      repository,
      routing,
    ),
    false,
  )
})

test('명시적으로 동기화한 정본만 키 없는 제목으로 연결하고 잘못된 후보를 쓰지 않는다', () => {
  const custom = {
    ...routing,
    canonicalIssues: { 'IPGO-201': { repository, number: 250, mode: 'sync' } },
  }
  const result = plan([issue(201)], {
    routing: custom,
    githubIssues: [
      { number: 251, title: '[IPGO-201] 잘못된 후보' },
      { number: 250, title: '정본 구현' },
    ],
  })
  assert.equal(result.existing[0].githubIssue.number, 250)
  assert.equal(result.create.length, 0)
  const missing = plan([issue(201)], { routing: custom })
  assert.equal(missing.create.length, 0)
  assert.equal(missing.skipped[0].reason, 'canonical-missing')
})

test('조회한 node id로 정본을 식별하며 다른 저장소 URL은 거부한다', () => {
  const custom = {
    ...routing,
    canonicalIssues: {
      'IPGO-201': { repository, nodeId: 'STABLE-ID', mode: 'sync' },
    },
  }
  const primary = { number: 250, node_id: 'STABLE-ID', title: '원본' }
  assert.equal(
    plan([issue(201)], { routing: custom, githubIssues: [primary] }).existing[0]
      .githubIssue,
    primary,
  )
  assert.equal(
    canSyncGithubIssue(
      {
        ...primary,
        html_url: 'https://github.com/IpgoITGO/ipgo-server/issues/250',
      },
      'IPGO-201',
      repository,
      custom,
    ),
    false,
  )
})

test('기존 다른 저장소 연결·제외 제목만 있는 작업은 갱신·대체 생성하지 않는다', () => {
  const result = plan([issue(201, '[서버] API'), issue(202)], {
    githubIssues: [
      { number: 250, title: '[IPGO-201] 서버' },
      { number: 59, title: '[IPGO-202] 제외' },
    ],
  })
  assert.equal(result.existing.length, 0)
  assert.equal(result.create.length, 0)
  assert.equal(result.skipped[1].reason, 'retired-binding')
})

test('한 Issue의 여러 키·참고 본문·누락된 번호로 상태 전환을 추측하지 않는다', () => {
  for (const value of [
    { number: 250, title: '[IPGO-201][IPGO-202] 협의' },
    { number: 250, title: '참고', body: 'IPGO-201' },
    { title: '[IPGO-201]' },
  ])
    assert.equal(
      canSyncGithubIssue(value, 'IPGO-201', repository, routing),
      false,
    )
  assert.equal(isJiraKeySyncEnabled('IPGO-111', repository, routing), false)
  assert.equal(isJiraKeySyncEnabled('IPGO-77', repository, routing), true)
})

test('정본·제외 설정 오류와 한 정본의 복수 동기화는 쓰기 전에 거부한다', () => {
  const binding = { repository, number: 250, mode: 'sync' }
  for (const patch of [
    { jiraOnlyKeys: {} },
    { jiraOnlyKeys: ['OTHER-1'] },
    { excludedIssues: [] },
    { excludedIssues: { [repository]: ['59'] } },
    { canonicalIssues: [] },
    { canonicalIssues: { 'IPGO-201': { ...binding, mode: 'typo' } } },
    { canonicalIssues: { 'IPGO-201': { ...binding, nodeId: 'both' } } },
    { canonicalIssues: { 'IPGO-201': { ...binding, number: 59 } } },
    { canonicalIssues: { 'IPGO-201': binding, 'IPGO-202': binding } },
    { jiraOnlyKeys: ['IPGO-201'], canonicalIssues: { 'IPGO-201': binding } },
  ])
    assert.throws(() => plan([], { routing: { ...routing, ...patch } }))
})

test('운영 완료는 commit 제목 또는 GitHub merge의 PR 제목만 읽는다', () => {
  assert.deepEqual(releaseJiraKeys('[IPGO-77] 수정\n\n참고 IPGO-78', 'IPGO'), [
    'IPGO-77',
  ])
  assert.deepEqual(
    releaseJiraKeys(
      'Merge pull request #9 from org/dev\n\n[IPGO-77] 운영 배포\n\n참고 IPGO-78',
      'IPGO',
    ),
    ['IPGO-77'],
  )
  assert.deepEqual(releaseJiraKeys('키 없는 제목\n\n참고 IPGO-77', 'IPGO'), [])
})

test('번호와 node id 별칭이 같은 정본을 여러 Jira에 연결하면 쓰지 않는다', () => {
  const custom = {
    ...routing,
    canonicalIssues: {
      'IPGO-201': { repository, number: 250, mode: 'sync' },
      'IPGO-202': { repository, nodeId: 'SAME', mode: 'sync' },
    },
  }
  const primary = { number: 250, node_id: 'SAME', title: '[IPGO-201] 원본' }
  assert.equal(
    canSyncGithubIssue(primary, 'IPGO-201', repository, custom),
    false,
  )
  assert.equal(
    canSyncGithubIssue(primary, 'IPGO-202', repository, custom),
    false,
  )
  const result = plan([issue(201), issue(202)], {
    routing: custom,
    githubIssues: [primary],
  })
  assert.equal(result.existing.length, 0)
  assert.equal(result.create.length, 0)
})

test('실제 정리 설정은 Client 미러 37건과 AI 총괄 미러를 빠짐없이 제외한다', () => {
  assert.deepEqual(
    routing.excludedIssues[repository],
    [
      56, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 82,
      83, 84, 85, 86, 87, 90, 91, 92, 93, 94, 95, 96, 97, 98, 101, 102, 103,
      104, 107,
    ],
  )
  assert.deepEqual(routing.excludedIssues['IpgoITGO/ipgo-ai'], [42])
  for (const [key, number] of [
    ['IPGO-65', 59],
    ['IPGO-69', 60],
    ['IPGO-71', 61],
  ]) {
    assert.deepEqual(routing.canonicalIssues[key], {
      repository: 'IpgoITGO/ipgo-server',
      number,
      mode: 'reference',
    })
  }
  assert.equal(Object.keys(routing.canonicalIssues).length, 24)
  assert.equal(
    Object.values(routing.canonicalIssues).every((x) => x.mode === 'reference'),
    true,
  )
})

test('분류되지 않은 공통 작업은 과거 연결이 있어도 쓰지 않는다', () => {
  const result = plan([issue(201, '[공통] 일정')], {
    githubIssues: [{ number: 250, title: '[IPGO-201] 과거 일정' }],
  })
  assert.equal(result.existing.length, 0)
  assert.equal(result.create.length, 0)
})

test('인증 접두사의 실제 Client #32는 명시적 소유권으로 계속 동기화한다', () => {
  const source = { number: 32, title: '[IPGO-30] 실서버 인증 연결' }
  const result = plan([issue(30, '[인증] 실서버 연동과 로그아웃')], {
    githubIssues: [source],
  })
  assert.equal(result.existing[0].githubIssue, source)
  assert.equal(result.create.length, 0)
})
