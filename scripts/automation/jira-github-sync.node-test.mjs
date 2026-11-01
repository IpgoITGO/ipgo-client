import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const githubOrigin = 'https://api.github.com'
const jiraOrigin = 'https://jira.invalid'
const repoPath = '/repos/IpgoITGO/ipgo-client/issues'
const script = fileURLToPath(new URL('./jira-github-sync.mjs', import.meta.url))
const userMap = JSON.parse(
  readFileSync(
    new URL('../../.github/jira-github-users.json', import.meta.url),
    'utf8',
  ),
)
const [jiraAccountId, githubLogin] = Object.entries(userMap)[0]

// 자식 프로세스의 fetch를 전부 대체하고 정의하지 않은 통신은 차단한다.
// 실제 fetch와 인증정보는 전달하지 않는다.
const mockLoader = `
import { readFileSync, writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
const routes = JSON.parse(readFileSync(process.env.SYNC_TEST_ROUTES, 'utf8'))
const calls = []
process.on('exit', () => writeFileSync(process.env.SYNC_TEST_CALLS, JSON.stringify(calls)))
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input)
  const call = { method: options.method ?? 'GET', origin: url.origin, path: url.pathname + url.search, body: options.body ? JSON.parse(options.body) : null }
  calls.push(call)
  const index = routes.findIndex(route => route.method === call.method && route.origin === call.origin && route.path === call.path && Object.entries(route.bodySubset ?? {}).every(([key, value]) => isDeepStrictEqual(call.body?.[key], value)))
  if (index < 0) throw new Error('정의하지 않은 통신 차단: ' + call.method + ' ' + call.origin + call.path)
  const [route] = routes.splice(index, 1)
  return { ok: (route.status ?? 200) < 400, status: route.status ?? 200, text: async () => JSON.stringify(route.response) }
}
`

const gh = (method, path, response, extra = {}) => ({
  method,
  origin: githubOrigin,
  path,
  response,
  ...extra,
})
const jira = (method, path, response, extra = {}) => ({
  method,
  origin: jiraOrigin,
  path,
  response,
  ...extra,
})
const task = (number, summary = '[화면] 신규 작업', extra = {}) => ({
  key: `IPGO-${number}`,
  fields: {
    summary,
    created: '2026-10-30T12:00:00+0900',
    status: { statusCategory: { key: 'new' } },
    ...extra,
  },
})
const linkedIssue = {
  number: 47,
  title: '[IPGO-77] 동기화',
  body: '',
  state: 'open',
  node_id: 'NODE47',
  assignees: [],
  html_url: 'https://github.com/IpgoITGO/ipgo-client/issues/47',
}
const pollRoutes = (issues, githubIssues = [], fields = []) => [
  jira('GET', '/rest/api/3/field', fields),
  jira('POST', '/rest/api/3/search/jql', { issues, isLast: true }),
  gh('GET', `${repoPath}?state=all&per_page=100&page=1`, githubIssues),
]
const commentReads = (key, number) => [
  jira('GET', `/rest/api/3/issue/${key}/comment?maxResults=100`, {
    comments: [],
  }),
  gh('GET', `${repoPath}/${number}/comments?per_page=100`, []),
]

function runFixture(t, { command = 'poll', routes, event = {}, env = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'ipgo-sync-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const paths = Object.fromEntries(
    ['loader.mjs', 'routes.json', 'calls.json', 'event.json'].map((name) => [
      name,
      join(dir, name),
    ]),
  )
  writeFileSync(paths['loader.mjs'], mockLoader)
  writeFileSync(paths['routes.json'], JSON.stringify(routes))
  writeFileSync(paths['event.json'], JSON.stringify(event))
  const result = spawnSync(
    process.execPath,
    ['--import', paths['loader.mjs'], script, command],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        PATH: process.env.PATH,
        GITHUB_REPOSITORY: 'IpgoITGO/ipgo-client',
        GH_TOKEN: 'test-only',
        JIRA_BASE_URL: jiraOrigin,
        JIRA_PROJECT_KEY: 'IPGO',
        JIRA_USER_EMAIL: 'test@example.invalid',
        JIRA_API_TOKEN: 'test-only',
        JIRA_SYNC_CREATED_AFTER: '2026-10-28',
        JIRA_AUTO_CREATE_AFTER: '2026-10-28T18:27:00+09:00',
        JIRA_AUTO_CREATE_LIMIT: '5',
        GITHUB_EVENT_PATH: paths['event.json'],
        SYNC_TEST_ROUTES: paths['routes.json'],
        SYNC_TEST_CALLS: paths['calls.json'],
        ...env,
      },
    },
  )
  assert.ifError(result.error)
  assert.doesNotMatch(result.stderr, /정의하지 않은 통신 차단/)
  return {
    ...result,
    calls: JSON.parse(readFileSync(paths['calls.json'], 'utf8')),
  }
}

test('생성 한도 초과에도 기존 작업의 상태·담당자·댓글·기간을 갱신한다', (t) => {
  const old = task(77, '[배포] 기존 작업', {
    status: { statusCategory: { key: 'done' } },
    assignee: { accountId: jiraAccountId },
    customfield_start: '2026-11-01',
    duedate: '2026-11-06',
  })
  const routes = [
    ...pollRoutes(
      [old, ...Array.from({ length: 6 }, (_, i) => task(201 + i))],
      [linkedIssue],
      [{ id: 'customfield_start', name: 'Start date' }],
    ),
    gh('GET', `${repoPath}/47`, linkedIssue),
    gh('PATCH', `${repoPath}/47`, {}, { bodySubset: { state: 'closed' } }),
    gh(
      'PATCH',
      `${repoPath}/47`,
      {},
      { bodySubset: { assignees: [githubLogin] } },
    ),
    jira('GET', '/rest/api/3/issue/IPGO-77/comment?maxResults=100', {
      comments: [
        { id: 'C1', body: '새 댓글', author: { displayName: '테스트 작성자' } },
      ],
    }),
    gh('GET', `${repoPath}/47/comments?per_page=100`, []),
    gh('POST', `${repoPath}/47/comments`, {}),
    gh('POST', '/graphql', {
      data: {
        organization: {
          projectV2: {
            id: 'P1',
            fields: {
              nodes: [
                { id: 'F1', name: '시작일' },
                { id: 'F2', name: '마감일' },
              ],
            },
          },
        },
        node: {
          projectItems: {
            nodes: [
              { id: 'I1', project: { id: 'P1' }, fieldValues: { nodes: [] } },
            ],
          },
        },
      },
    }),
    gh('POST', '/graphql', {}),
    gh('POST', '/graphql', {}),
    gh('PATCH', `${repoPath}/47`, {}),
  ]
  const result = runFixture(t, {
    routes,
    env: { PROJECT_V2_NUMBER: '1', PROJECTS_TOKEN: 'test-only' },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /::warning::신규 생성 후보 6건.*신규 생성만 보류/)
  assert.match(
    result.stdout,
    /기존 연결 1건 갱신, 신규 0건 생성, 한도 초과 보류 6건/,
  )
  assert.equal(
    result.calls.some((x) => x.method === 'POST' && x.path === repoPath),
    false,
  )
  assert.equal(
    result.calls.some((x) => x.path.includes('/remotelink')),
    false,
  )
  const changes = result.calls.filter((x) => x.method === 'PATCH')
  assert.equal(changes[0].body.state, 'closed')
  assert.deepEqual(changes[1].body.assignees, [githubLogin])
  assert.match(changes[2].body.body, /"start":"2026-11-01","due":"2026-11-06"/)
  const dates = result.calls.filter(
    (x) => x.path === '/graphql' && x.body.variables.date,
  )
  assert.deepEqual(
    dates.map((x) => x.body.variables.date),
    ['2026-11-01', '2026-11-06'],
  )
  assert.match(
    result.calls.find(
      (x) => x.method === 'POST' && x.path.endsWith('/comments'),
    ).body.body,
    /sync:jira-comment:C1/,
  )
})

test('한도 이하에서는 이 저장소의 신규 작업만 생성하고 Jira 역링크를 남긴다', (t) => {
  const fresh = {
    ...linkedIssue,
    number: 99,
    title: '[IPGO-201] [화면] 신규 작업',
    html_url: 'https://github.com/IpgoITGO/ipgo-client/issues/99',
  }
  const result = runFixture(t, {
    routes: [
      ...pollRoutes([
        task(201),
        task(202, '[서버] API'),
        task(203, '[AI] 계산'),
        task(204, '[공통] 회의'),
        task(205, '[화면] 이전', { created: '2026-10-28T18:26:00+0900' }),
      ]),
      gh('POST', repoPath, fresh),
      jira('POST', '/rest/api/3/issue/IPGO-201/remotelink', {}),
      gh('GET', `${repoPath}/99`, fresh),
      ...commentReads('IPGO-201', 99),
    ],
  })
  assert.equal(result.status, 0, result.stderr)
  const creations = result.calls.filter(
    (x) => x.method === 'POST' && x.path === repoPath,
  )
  assert.equal(creations.length, 1)
  assert.equal(creations[0].body.title, fresh.title)
  assert.equal(
    result.calls.find((x) => x.path.endsWith('/remotelink')).body.object.url,
    fresh.html_url,
  )
  assert.match(result.stdout, /IPGO-202.*ipgo-server/)
  assert.match(result.stdout, /IPGO-203.*ipgo-ai/)
  assert.match(result.stdout, /IPGO-204.*담당 저장소 확인 필요/)
  assert.equal(
    result.calls
      .filter((x) => x.origin === githubOrigin)
      .every((x) => x.path.startsWith(repoPath)),
    true,
  )
})

test('Jira와 GitHub의 다음 페이지에 있는 기존 연결도 갱신한다', (t) => {
  const routes = [
    jira('GET', '/rest/api/3/field', []),
    jira('POST', '/rest/api/3/search/jql', {
      issues: [],
      isLast: false,
      nextPageToken: 'page-2',
    }),
    jira(
      'POST',
      '/rest/api/3/search/jql',
      { issues: [task(77)], isLast: true },
      { bodySubset: { nextPageToken: 'page-2' } },
    ),
    gh(
      'GET',
      `${repoPath}?state=all&per_page=100&page=1`,
      Array.from({ length: 100 }, (_, i) => ({
        number: i + 100,
        title: 'PR',
        pull_request: {},
      })),
    ),
    gh('GET', `${repoPath}?state=all&per_page=100&page=2`, [linkedIssue]),
    gh('GET', `${repoPath}/47`, linkedIssue),
    ...commentReads('IPGO-77', 47),
  ]
  const result = runFixture(t, { routes })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /기존 연결 1건 갱신/)
})

test('깨진 Jira 페이지 토큰은 쓰기 전에 거부한다', (t) => {
  const result = runFixture(t, {
    routes: [
      jira('GET', '/rest/api/3/field', []),
      jira('POST', '/rest/api/3/search/jql', {
        issues: [task(77)],
        isLast: false,
      }),
    ],
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /조회 페이지 정보가 올바르지 않습니다/)
  assert.equal(
    result.calls.some(
      (x) => x.method !== 'GET' && x.path !== '/rest/api/3/search/jql',
    ),
    false,
  )
})

test('신규 생성 보류와 달리 실제 API 오류는 실행 실패로 남긴다', (t) => {
  const result = runFixture(t, {
    routes: [
      jira(
        'GET',
        '/rest/api/3/field',
        { message: '시험 오류' },
        { status: 500 },
      ),
    ],
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /실패 \(500\)/)
})

test('한도 설정이 잘못되면 기존 연결에도 쓰기 요청을 보내지 않는다', (t) => {
  for (const limit of ['-1', 'invalid']) {
    const result = runFixture(t, {
      routes: pollRoutes([task(77)], [linkedIssue]),
      env: { JIRA_AUTO_CREATE_LIMIT: limit },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /0 이상의 정수/)
    assert.equal(
      result.calls.every(
        (x) => x.method === 'GET' || x.path === '/rest/api/3/search/jql',
      ),
      true,
    )
  }
})

test('PR 본문에 SHA-256과 다른 프로젝트 키가 있어도 IPGO 작업만 전환한다', (t) => {
  const result = runFixture(t, {
    command: 'event',
    env: { GITHUB_EVENT_NAME: 'pull_request_target' },
    event: {
      action: 'opened',
      pull_request: {
        title: '[IPGO-77] 동기화',
        body: 'SHA-256 OTHER-12 IPGO-77',
        head: { ref: 'feature/IPGO-77-sync' },
      },
    },
    routes: [
      jira('GET', '/rest/api/3/issue/IPGO-77/transitions', {
        transitions: [
          { id: '3', to: { statusCategory: { key: 'indeterminate' } } },
        ],
      }),
      jira('POST', '/rest/api/3/issue/IPGO-77/transitions', {}),
    ],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.length, 2)
  assert.deepEqual(result.calls[1].body, { transition: { id: '3' } })
})

test('Issue 본문의 참고 키만으로 다른 작업의 상태나 댓글을 변경하지 않는다', (t) => {
  for (const eventName of ['issues', 'issue_comment']) {
    const result = runFixture(t, {
      command: 'event',
      env: { GITHUB_EVENT_NAME: eventName },
      routes: [],
      event: {
        action: eventName === 'issues' ? 'closed' : 'created',
        issue: { title: '키 없는 작업 SHA-256', body: '참고 IPGO-77' },
        comment: { id: 1, body: '댓글', user: { login: 'tester' } },
      },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.calls.length, 0)
  }
})

test('운영 완료 경로도 IPGO 프로젝트 키만 처리한다', (t) => {
  const result = runFixture(t, {
    command: 'complete',
    env: { SYNC_TEXT: 'SHA-256 OTHER-12 [IPGO-77]' },
    routes: [
      jira('GET', '/rest/api/3/issue/IPGO-77/transitions', {
        transitions: [{ id: 'done', to: { statusCategory: { key: 'done' } } }],
      }),
      jira('POST', '/rest/api/3/issue/IPGO-77/transitions', {}),
      gh(
        'GET',
        '/search/issues?q=repo%3AIpgoITGO%2Fipgo-client+is%3Aissue+in%3Atitle+%22%5BIPGO-77%5D%22&per_page=20',
        { items: [{ ...linkedIssue, state: 'closed' }] },
      ),
    ],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.length, 3)
})
