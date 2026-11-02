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
  const call = { method: options.method ?? 'GET', origin: url.origin, path: url.pathname + url.search, redirect: options.redirect, body: options.body ? JSON.parse(options.body) : null }
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
const jiraCurrent = (key, category = 'new', summary = '[화면] 개발 작업') =>
  jira('GET', `/rest/api/3/issue/${key}?fields=summary,status`, {
    fields: { summary, status: { statusCategory: { key: category } } },
  })

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
      gh('GET', `${repoPath}?state=all&per_page=100&page=1`, [linkedIssue]),
      jiraCurrent('IPGO-77'),
      jira('GET', '/rest/api/3/issue/IPGO-77/transitions', {
        transitions: [
          { id: '3', to: { statusCategory: { key: 'indeterminate' } } },
        ],
      }),
      jira('POST', '/rest/api/3/issue/IPGO-77/transitions', {}),
    ],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.length, 4)
  assert.deepEqual(result.calls[3].body, { transition: { id: '3' } })
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
      gh('GET', `${repoPath}?state=all&per_page=100&page=1`, [
        { ...linkedIssue, state: 'closed' },
      ]),
      gh('GET', `${repoPath}/47`, { ...linkedIssue, state: 'closed' }),
      jiraCurrent('IPGO-77'),
      jira('GET', '/rest/api/3/issue/IPGO-77/transitions', {
        transitions: [{ id: 'done', to: { statusCategory: { key: 'done' } } }],
      }),
      jira('POST', '/rest/api/3/issue/IPGO-77/transitions', {}),
    ],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.length, 5)
})

test('닫힌 PM·서버 미러와 참조 정본은 poll에서 어떤 쓰기도 발생하지 않는다', (t) => {
  const legacy = [
    { ...linkedIssue, number: 59, title: '[IPGO-47] Scrum', state: 'closed' },
    { ...linkedIssue, number: 101, title: '[IPGO-80] 서버', state: 'closed' },
    { ...linkedIssue, number: 93, title: '[IPGO-73] 중복', state: 'closed' },
  ]
  const result = runFixture(t, {
    routes: [
      ...pollRoutes(
        [task(47, '[공통] Scrum'), task(80, '[서버] 정제'), task(73)],
        [...legacy, { number: 39, title: '원본 탭 제목', state: 'closed' }],
      ),
      ...legacy.flatMap((value) => [
        gh('GET', `${repoPath}/${value.number}`, value),
        gh(
          'PATCH',
          `${repoPath}/${value.number}`,
          {},
          { bodySubset: { state: 'open' } },
        ),
        ...commentReads(value.title.match(/IPGO-\d+/)[0], value.number),
        gh('PATCH', `${repoPath}/${value.number}`, {}),
      ]),
    ],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.filter((x) => x.method === 'PATCH').length, 0)
  assert.equal(result.calls.length, 3)
  assert.match(result.stdout, /기존 연결 0건 갱신, 신규 0건 생성/)
})

test('제외 Issue의 종료·재오픈·담당 변경·댓글은 Jira에 접근하지 않는다', (t) => {
  for (const [number, key] of [
    [59, 'IPGO-47'],
    [101, 'IPGO-80'],
    [93, 'IPGO-73'],
  ]) {
    for (const action of [
      'closed',
      'reopened',
      'assigned',
      'unassigned',
      'created',
    ]) {
      const result = runFixture(t, {
        command: 'event',
        routes: [],
        env: {
          GITHUB_EVENT_NAME: action === 'created' ? 'issue_comment' : 'issues',
        },
        event: {
          action,
          issue: { number, title: `[${key}] 미러`, assignees: [] },
          comment: { id: 1, body: '정리 안내', user: { login: 'tester' } },
        },
      })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.calls.length, 0)
    }
  }
})

test('다른 저장소에서 실행해도 Jira 전용 AI #42는 Jira에 쓰지 않는다', (t) => {
  const result = runFixture(t, {
    command: 'event',
    routes: [],
    env: { GITHUB_REPOSITORY: 'IpgoITGO/ipgo-ai', GITHUB_EVENT_NAME: 'issues' },
    event: {
      action: 'closed',
      issue: { number: 42, title: '[IPGO-111] 전체 계획' },
    },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.length, 0)
})

test('정상 Client Issue 종료·댓글은 기존대로 동기화한다', (t) => {
  const closed = runFixture(t, {
    command: 'event',
    env: { GITHUB_EVENT_NAME: 'issues' },
    event: { action: 'closed', issue: linkedIssue },
    routes: [
      jiraCurrent('IPGO-77'),
      jira('GET', '/rest/api/3/issue/IPGO-77/transitions', {
        transitions: [{ id: '41', to: { statusCategory: { key: 'done' } } }],
      }),
      jira('POST', '/rest/api/3/issue/IPGO-77/transitions', {}),
    ],
  })
  assert.equal(closed.status, 0, closed.stderr)
  assert.equal(closed.calls.at(-1).body.transition.id, '41')
  const comment = runFixture(t, {
    command: 'event',
    env: { GITHUB_EVENT_NAME: 'issue_comment' },
    event: {
      action: 'created',
      issue: linkedIssue,
      comment: { id: 9, body: '확인 의견', user: { login: 'tester' } },
    },
    routes: [
      jira('GET', '/rest/api/3/issue/IPGO-77?fields=summary', {
        fields: { summary: '[화면] 작업' },
      }),
      jira('POST', '/rest/api/3/issue/IPGO-77/comment', {}),
    ],
  })
  assert.equal(comment.status, 0, comment.stderr)
  assert.equal(comment.calls.length, 2)
})

test('PR 본문 참고·Jira 전용·타 저장소 정본 키는 상태 전환하지 않는다', (t) => {
  for (const pr of [
    { title: '문서 정리', body: '[IPGO-77]', head: { ref: 'feature/docs' } },
    { title: '[IPGO-111] 전체 계획', head: { ref: 'feature/IPGO-111' } },
    { title: '[IPGO-80] 서버', head: { ref: 'feature/IPGO-80' } },
  ]) {
    const result = runFixture(t, {
      command: 'event',
      routes: [],
      env: { GITHUB_EVENT_NAME: 'pull_request_target' },
      event: { action: 'opened', pull_request: pr },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.calls.length, 0)
  }
})

test('완료된 Jira는 후속 PR을 열어도 진행 중으로 되돌리지 않는다', (t) => {
  const result = runFixture(t, {
    command: 'event',
    env: { GITHUB_EVENT_NAME: 'pull_request_target' },
    event: {
      action: 'opened',
      pull_request: {
        title: '[IPGO-77] 후속',
        head: { ref: 'feature/IPGO-77' },
      },
    },
    routes: [
      gh('GET', `${repoPath}?state=all&per_page=100&page=1`, [linkedIssue]),
      jiraCurrent('IPGO-77', 'done'),
    ],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.length, 2)
})

test('제외·참조 키 또는 commit 본문 참고 키는 운영 완료에서도 쓰지 않는다', (t) => {
  for (const text of [
    '[IPGO-111] 전체 계획',
    '[IPGO-80] 서버',
    '[IPGO-73] 이력',
    '배포\n\n참고 IPGO-77',
  ]) {
    const result = runFixture(t, {
      command: 'complete',
      routes: [],
      env: { SYNC_TEXT: text },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.calls.length, 0)
  }
})

test('운영 완료에 유일한 살아 있는 정본이 없으면 Jira 완료도 하지 않는다', (t) => {
  const result = runFixture(t, {
    command: 'complete',
    env: { SYNC_TEXT: '[IPGO-201] 완료' },
    routes: [
      gh('GET', `${repoPath}?state=all&per_page=100&page=1`, [
        { number: 59, title: '[IPGO-201] 제외 미러' },
      ]),
    ],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.length, 1)
})

test('쓰는 직전에 이관된 정본 응답을 받으면 다른 저장소에 쓰지 않는다', (t) => {
  const moved = {
    ...linkedIssue,
    html_url: 'https://github.com/IpgoITGO/ipgo-server/issues/47',
  }
  const result = runFixture(t, {
    routes: [
      ...pollRoutes([task(77)], [linkedIssue]),
      gh('GET', `${repoPath}/47`, moved),
    ],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.filter((x) => x.method === 'PATCH').length, 0)
  assert.equal(
    result.calls
      .filter((x) => x.origin === githubOrigin)
      .every((x) => x.redirect === 'error'),
    true,
  )
})

test('새로 잘못 배치된 서버 작업의 상태 이벤트도 Jira 쓰기를 거부한다', (t) => {
  const result = runFixture(t, {
    command: 'event',
    env: { GITHUB_EVENT_NAME: 'issues' },
    event: {
      action: 'closed',
      issue: { number: 250, title: '[IPGO-201] 서버' },
    },
    routes: [jiraCurrent('IPGO-201', 'new', '[서버] API')],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.length, 1)
})

test('정상 정본의 담당자 배정·명시적 재오픈은 보존하고 댓글 반사는 차단한다', (t) => {
  const assigned = runFixture(t, {
    command: 'event',
    env: { GITHUB_EVENT_NAME: 'issues' },
    event: {
      action: 'assigned',
      issue: { ...linkedIssue, assignees: [{ login: githubLogin }] },
    },
    routes: [
      jira('GET', '/rest/api/3/issue/IPGO-77?fields=summary,assignee', {
        fields: { summary: '[화면] 작업', assignee: null },
      }),
      jira('PUT', '/rest/api/3/issue/IPGO-77/assignee', {}),
    ],
  })
  assert.equal(assigned.status, 0, assigned.stderr)
  assert.equal(assigned.calls.at(-1).body.accountId, jiraAccountId)
  const reopened = runFixture(t, {
    command: 'event',
    env: { GITHUB_EVENT_NAME: 'issues' },
    event: { action: 'reopened', issue: linkedIssue },
    routes: [
      jiraCurrent('IPGO-77', 'done'),
      jira('GET', '/rest/api/3/issue/IPGO-77/transitions', {
        transitions: [{ id: '11', to: { statusCategory: { key: 'new' } } }],
      }),
      jira('POST', '/rest/api/3/issue/IPGO-77/transitions', {}),
    ],
  })
  assert.equal(reopened.status, 0, reopened.stderr)
  const echo = runFixture(t, {
    command: 'event',
    routes: [],
    env: { GITHUB_EVENT_NAME: 'issue_comment' },
    event: {
      action: 'created',
      issue: linkedIssue,
      comment: { body: '<!-- sync:jira-comment:1 -->', id: 1 },
    },
  })
  assert.equal(echo.status, 0, echo.stderr)
  assert.equal(echo.calls.length, 0)
})

test('유효한 main merge PR 제목은 정본을 완료하되 commit 참고 키는 무시한다', (t) => {
  const result = runFixture(t, {
    command: 'complete',
    env: {
      SYNC_TEXT:
        'Merge pull request #7 from IpgoITGO/dev\n\n[IPGO-77] 운영 배포\n\n참고 IPGO-80',
    },
    routes: [
      gh('GET', `${repoPath}?state=all&per_page=100&page=1`, [linkedIssue]),
      gh('GET', `${repoPath}/47`, linkedIssue),
      jiraCurrent('IPGO-77'),
      jira('GET', '/rest/api/3/issue/IPGO-77/transitions', {
        transitions: [{ id: '41', to: { statusCategory: { key: 'done' } } }],
      }),
      jira('POST', '/rest/api/3/issue/IPGO-77/transitions', {}),
      gh('PATCH', `${repoPath}/47`, {}),
    ],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.at(-1).body.state, 'closed')
  assert.equal(result.calls.length, 6)
})

test('새 공통 일정의 종료도 저장소 목적지가 불명확하면 Jira에 쓰지 않는다', (t) => {
  const result = runFixture(t, {
    command: 'event',
    env: { GITHUB_EVENT_NAME: 'issues' },
    event: {
      action: 'closed',
      issue: { number: 250, title: '[IPGO-201] 공통' },
    },
    routes: [jiraCurrent('IPGO-201', 'new', '[공통] 일정')],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.length, 1)
})

test('Client 인증 #32의 [인증] 작업도 상태 동기화를 유지한다', (t) => {
  const result = runFixture(t, {
    command: 'event',
    env: { GITHUB_EVENT_NAME: 'issues' },
    event: {
      action: 'closed',
      issue: { number: 32, title: '[IPGO-30] 실서버 인증 연결' },
    },
    routes: [
      jiraCurrent('IPGO-30', 'indeterminate', '[인증] 실서버 연동'),
      jira('GET', '/rest/api/3/issue/IPGO-30/transitions', {
        transitions: [{ id: '41', to: { statusCategory: { key: 'done' } } }],
      }),
      jira('POST', '/rest/api/3/issue/IPGO-30/transitions', {}),
    ],
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.at(-1).body.transition.id, '41')
})
