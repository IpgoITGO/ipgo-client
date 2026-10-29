import { readFile } from 'node:fs/promises'

import {
  assertAutoCreateLimit,
  extractJiraKeys,
  githubCommentMarker,
  indexGithubIssuesByJiraKey,
  isSyncedGithubComment,
  isSyncedJiraComment,
  jiraCommentMarker,
  planGithubAssigneeSync,
  planJiraAssigneeSync,
  readSyncMarker,
  resolveDateSync,
  shouldAutoCreateGithubIssue,
  writeSyncMarker,
} from './sync-lib.mjs'

const command = process.argv[2]
const repository = process.env.GITHUB_REPOSITORY
const [owner, repo] = repository?.split('/') ?? []
const githubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
const projectsToken = process.env.PROJECTS_TOKEN
const jiraBaseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '')
const jiraProjectKey = process.env.JIRA_PROJECT_KEY || 'IPGO'
const jiraSyncCreatedAfter = process.env.JIRA_SYNC_CREATED_AFTER
const jiraAutoCreateAfter = process.env.JIRA_AUTO_CREATE_AFTER
const jiraAutoCreateLimit = Number(process.env.JIRA_AUTO_CREATE_LIMIT || 5)
const jiraAuth = Buffer.from(
  `${process.env.JIRA_USER_EMAIL ?? ''}:${process.env.JIRA_API_TOKEN ?? ''}`,
).toString('base64')
const githubProjectNumber = Number(process.env.PROJECT_V2_NUMBER || 0)
const userMap = JSON.parse(
  await readFile(
    new URL('../../.github/jira-github-users.json', import.meta.url),
    'utf8',
  ),
)

function requireEnvironment(names) {
  const missing = names.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(`필수 환경 변수가 없습니다: ${missing.join(', ')}`)
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${url} 실패 (${response.status}): ${text.slice(0, 500)}`,
    )
  }
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(
      `${options.method ?? 'GET'} ${url} 응답이 JSON 형식이 아닙니다: ${text.slice(0, 200)}`,
    )
  }
}

function github(path, options = {}, token = githubToken) {
  return request(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  })
}

function jira(path, options = {}) {
  return request(`${jiraBaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${jiraAuth}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

function adfText(node) {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (node.type === 'text') return node.text ?? ''
  const separator = ['paragraph', 'heading', 'listItem'].includes(node.type)
    ? '\n'
    : ''
  return `${(node.content ?? []).map(adfText).join('')}${separator}`
}

function textToAdf(text) {
  return {
    version: 1,
    type: 'doc',
    content: String(text)
      .split(/\n{2,}/)
      .map((paragraph) => ({
        type: 'paragraph',
        content: paragraph
          ? [{ type: 'text', text: paragraph.slice(0, 30000) }]
          : [],
      })),
  }
}

function reverseUserMap() {
  return Object.fromEntries(
    Object.entries(userMap).map(([accountId, username]) => [
      username.toLowerCase(),
      accountId,
    ]),
  )
}

async function findGithubIssue(jiraKey) {
  const query = new URLSearchParams({
    q: `repo:${repository} is:issue in:title "[${jiraKey}]"`,
    per_page: '20',
  })
  const result = await github(`/search/issues?${query}`)
  return (
    result.items.find((item) => item.title.includes(`[${jiraKey}]`)) ?? null
  )
}

async function getGithubIssue(number) {
  return github(`/repos/${owner}/${repo}/issues/${number}`)
}

async function listGithubIssues() {
  const issues = []

  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      state: 'all',
      per_page: '100',
      page: String(page),
    })
    const batch = await github(`/repos/${owner}/${repo}/issues?${query}`)
    issues.push(...batch)
    if (batch.length < 100) return issues
  }
}

async function createGithubIssue(jiraIssue) {
  const key = jiraIssue.key
  const fields = jiraIssue.fields
  const jiraUrl = `${jiraBaseUrl}/browse/${key}`
  const description = adfText(fields.description).trim()
  const mappedAssignee = fields.assignee?.accountId
    ? userMap[fields.assignee.accountId]
    : null
  const body = writeSyncMarker(
    `## 목적\n> ${fields.summary}\n\n${description || 'Jira 작업을 기준으로 상세 구현 내용을 기록합니다.'}\n\n## 작업\n- [ ] 세부 구현 항목 작성\n\n## 완료 조건\n- [ ] 검증 가능한 완료 조건 작성\n\n## 제외 범위\n- 범위 밖 작업 작성\n\n## Jira\n- [${key}](${jiraUrl})`,
    {
      start: fields.__startDate ?? null,
      due: fields.duedate ?? null,
    },
  )
  const issue = await github(`/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: `[${key}] ${fields.summary}`,
      body,
      assignees: mappedAssignee ? [mappedAssignee] : [],
    }),
  })

  await jira(`/rest/api/3/issue/${key}/remotelink`, {
    method: 'POST',
    body: JSON.stringify({
      globalId: `github-issue:${repository}:${issue.number}`,
      relationship: 'documents',
      object: {
        url: issue.html_url,
        title: `GitHub Issue #${issue.number}`,
        summary: issue.title,
      },
    }),
  })
  return issue
}

async function transitionJira(jiraKey, categoryKey) {
  const data = await jira(`/rest/api/3/issue/${jiraKey}/transitions`)
  const transition = data.transitions.find(
    (item) => item.to?.statusCategory?.key === categoryKey,
  )
  if (!transition) {
    console.log(
      `${jiraKey}: ${categoryKey} 전환이 없어 상태 변경을 건너뜁니다.`,
    )
    return
  }
  await jira(`/rest/api/3/issue/${jiraKey}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition: { id: transition.id } }),
  })
}

async function syncGithubStateFromJira(jiraIssue, githubIssue) {
  const shouldClose = jiraIssue.fields.status.statusCategory.key === 'done'
  const desired = shouldClose ? 'closed' : 'open'
  if (githubIssue.state !== desired) {
    await github(`/repos/${owner}/${repo}/issues/${githubIssue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: desired }),
    })
  }
}

async function syncGithubAssigneeFromJira(jiraIssue, githubIssue) {
  const plan = planGithubAssigneeSync({
    jiraAccountId: jiraIssue.fields.assignee?.accountId,
    githubAssignees: githubIssue.assignees,
    userMap,
  })
  if (plan.reason === 'assignee-conflict') {
    console.warn(
      `${jiraIssue.key} ↔ #${githubIssue.number}: 담당자가 서로 달라 자동 변경하지 않습니다.`,
    )
  }
  if (plan.reason === 'unmapped-jira-user') {
    console.warn(
      `${jiraIssue.key}: Jira 담당자 계정 매핑이 없어 GitHub 담당자를 변경하지 않습니다.`,
    )
  }
  if (plan.update) {
    await github(`/repos/${owner}/${repo}/issues/${githubIssue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ assignees: plan.desired }),
    })
  }
}

async function syncJiraCommentsToGithub(jiraKey, issueNumber) {
  const [jiraComments, githubComments] = await Promise.all([
    jira(`/rest/api/3/issue/${jiraKey}/comment?maxResults=100`),
    github(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
    ),
  ])
  const githubBodies = githubComments.map((comment) => comment.body ?? '')

  for (const comment of jiraComments.comments) {
    const text = adfText(comment.body).trim()
    if (!text || isSyncedJiraComment(text)) continue
    const marker = githubCommentMarker(comment.id)
    if (githubBodies.some((body) => body.includes(marker))) continue

    await github(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body: `${text}\n\n${marker}\n_Jira의 ${comment.author.displayName} 댓글에서 동기화됨_`,
      }),
    })
  }
}

async function graphql(query, variables) {
  const result = await github(
    '/graphql',
    { method: 'POST', body: JSON.stringify({ query, variables }) },
    projectsToken,
  )
  if (result.errors?.length) {
    throw new Error(
      `GitHub GraphQL 요청 실패: ${result.errors.map((error) => error.message).join('; ')}`,
    )
  }
  return result
}

async function projectContext(issueNodeId) {
  if (!githubProjectNumber || !projectsToken) return null
  const data = await graphql(
    `
      query ($owner: String!, $number: Int!, $issue: ID!) {
        organization(login: $owner) {
          projectV2(number: $number) {
            id
            fields(first: 50) {
              nodes {
                ... on ProjectV2Field {
                  id
                  name
                  dataType
                }
              }
            }
          }
        }
        node(id: $issue) {
          ... on Issue {
            projectItems(first: 50) {
              nodes {
                id
                project {
                  id
                }
                fieldValues(first: 50) {
                  nodes {
                    ... on ProjectV2ItemFieldDateValue {
                      date
                      field {
                        ... on ProjectV2Field {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    { owner, number: githubProjectNumber, issue: issueNodeId },
  )
  const project = data.data.organization.projectV2
  let item = data.data.node.projectItems.nodes.find(
    (candidate) => candidate.project.id === project.id,
  )
  if (!item) {
    const added = await graphql(
      `
        mutation ($project: ID!, $content: ID!) {
          addProjectV2ItemById(
            input: { projectId: $project, contentId: $content }
          ) {
            item {
              id
              project {
                id
              }
              fieldValues(first: 50) {
                nodes {
                  ... on ProjectV2ItemFieldDateValue {
                    date
                    field {
                      ... on ProjectV2Field {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { project: project.id, content: issueNodeId },
    )
    item = added.data.addProjectV2ItemById.item
  }
  const fields = Object.fromEntries(
    project.fields.nodes.filter(Boolean).map((field) => [field.name, field.id]),
  )
  const dates = Object.fromEntries(
    item.fieldValues.nodes
      .filter((value) => value?.field?.name)
      .map((value) => [value.field.name, value.date ?? null]),
  )
  return { projectId: project.id, itemId: item.id, fields, dates }
}

async function setProjectDate(context, fieldName, value) {
  const fieldId = context.fields[fieldName]
  if (!fieldId)
    throw new Error(`GitHub Project에 ${fieldName} 필드가 없습니다.`)
  if (value) {
    await graphql(
      `
        mutation ($project: ID!, $item: ID!, $field: ID!, $date: Date!) {
          updateProjectV2ItemFieldValue(
            input: {
              projectId: $project
              itemId: $item
              fieldId: $field
              value: { date: $date }
            }
          ) {
            projectV2Item {
              id
            }
          }
        }
      `,
      {
        project: context.projectId,
        item: context.itemId,
        field: fieldId,
        date: value,
      },
    )
  } else {
    await graphql(
      `
        mutation ($project: ID!, $item: ID!, $field: ID!) {
          clearProjectV2ItemFieldValue(
            input: { projectId: $project, itemId: $item, fieldId: $field }
          ) {
            projectV2Item {
              id
            }
          }
        }
      `,
      { project: context.projectId, item: context.itemId, field: fieldId },
    )
  }
}

async function updateJiraDates(jiraKey, startFieldId, values) {
  const fields = { duedate: values.due }
  if (startFieldId) fields[startFieldId] = values.start
  await jira(`/rest/api/3/issue/${jiraKey}`, {
    method: 'PUT',
    body: JSON.stringify({ fields }),
  })
}

async function syncDates(jiraIssue, githubIssue, startFieldId) {
  const context = await projectContext(githubIssue.node_id)
  if (!context) return
  const previous = readSyncMarker(githubIssue.body ?? '')
  const jiraDates = {
    start: jiraIssue.fields.__startDate ?? null,
    due: jiraIssue.fields.duedate ?? null,
  }
  const githubDates = {
    start: context.dates['시작일'] ?? null,
    due: context.dates['마감일'] ?? null,
  }
  const start = resolveDateSync({
    jiraValue: jiraDates.start,
    githubValue: githubDates.start,
    previousValue: previous.start,
  })
  const due = resolveDateSync({
    jiraValue: jiraDates.due,
    githubValue: githubDates.due,
    previousValue: previous.due,
  })

  if (start.update === 'github')
    await setProjectDate(context, '시작일', start.finalValue)
  if (due.update === 'github')
    await setProjectDate(context, '마감일', due.finalValue)
  if (start.update === 'jira' || due.update === 'jira') {
    await updateJiraDates(jiraIssue.key, startFieldId, {
      start: start.finalValue,
      due: due.finalValue,
    })
  }

  const nextBody = writeSyncMarker(githubIssue.body ?? '', {
    start: start.finalValue,
    due: due.finalValue,
  })
  if (nextBody !== githubIssue.body) {
    await github(`/repos/${owner}/${repo}/issues/${githubIssue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: nextBody }),
    })
  }
  if (start.conflict || due.conflict) {
    console.log(`${jiraIssue.key}: 기간 충돌이 있어 Jira 값을 우선했습니다.`)
  }
}

async function discoverStartField() {
  const fields = await jira('/rest/api/3/field')
  return fields.find((field) => ['Start date', '시작일'].includes(field.name))
    ?.id
}

async function jiraPoll() {
  requireEnvironment([
    'GITHUB_REPOSITORY',
    'GH_TOKEN',
    'JIRA_BASE_URL',
    'JIRA_USER_EMAIL',
    'JIRA_API_TOKEN',
    'JIRA_SYNC_CREATED_AFTER',
    'JIRA_AUTO_CREATE_AFTER',
  ])
  const startFieldId = await discoverStartField()
  const jql = `project = ${jiraProjectKey} AND created >= "${jiraSyncCreatedAfter}" ORDER BY updated ASC`
  const fields = [
    'summary',
    'description',
    'status',
    'assignee',
    'duedate',
    'created',
  ]
  if (startFieldId) fields.push(startFieldId)
  const result = await jira('/rest/api/3/search/jql', {
    method: 'POST',
    body: JSON.stringify({ jql, fields, maxResults: 100 }),
  })
  const githubIssuesByJiraKey = indexGithubIssuesByJiraKey(
    await listGithubIssues(),
  )

  const targets = []
  for (const jiraIssue of result.issues) {
    jiraIssue.fields.__startDate = startFieldId
      ? (jiraIssue.fields[startFieldId] ?? null)
      : null
    const githubIssue = githubIssuesByJiraKey.get(jiraIssue.key) ?? null
    const shouldCreate =
      !githubIssue &&
      shouldAutoCreateGithubIssue({
        jiraCreatedAt: jiraIssue.fields.created,
        autoCreateAfter: jiraAutoCreateAfter,
      })
    targets.push({ jiraIssue, githubIssue, shouldCreate })
  }

  assertAutoCreateLimit(
    targets.filter((target) => target.shouldCreate).length,
    jiraAutoCreateLimit,
  )

  for (const target of targets) {
    const { jiraIssue, shouldCreate } = target
    let { githubIssue } = target
    if (!githubIssue && !shouldCreate) {
      console.log(
        `${jiraIssue.key}: 신규 Issue 생성 기준 이전의 미연결 작업이라 건너뜁니다.`,
      )
      continue
    }
    if (!githubIssue) githubIssue = await createGithubIssue(jiraIssue)
    githubIssue = await getGithubIssue(githubIssue.number)

    await syncGithubStateFromJira(jiraIssue, githubIssue)
    await syncGithubAssigneeFromJira(jiraIssue, githubIssue)
    await syncJiraCommentsToGithub(jiraIssue.key, githubIssue.number)
    await syncDates(jiraIssue, githubIssue, startFieldId)
    console.log(`${jiraIssue.key} ↔ #${githubIssue.number} 동기화 완료`)
  }
}

async function syncIssueEvent(event) {
  const issue = event.issue
  const [jiraKey] = extractJiraKeys(issue.title, issue.body)
  if (!jiraKey || issue.pull_request) return

  if (event.action === 'closed') await transitionJira(jiraKey, 'done')
  if (event.action === 'reopened') await transitionJira(jiraKey, 'new')
  if (['assigned', 'unassigned'].includes(event.action)) {
    const jiraIssue = await jira(`/rest/api/3/issue/${jiraKey}?fields=assignee`)
    const plan = planJiraAssigneeSync({
      githubAssignees: issue.assignees,
      jiraAccountId: jiraIssue.fields.assignee?.accountId,
      reverseUserMap: reverseUserMap(),
    })
    if (plan.reason === 'assignee-conflict') {
      console.warn(
        `${jiraKey} ↔ #${issue.number}: 담당자가 서로 달라 자동 변경하지 않습니다.`,
      )
    }
    if (plan.reason === 'unmapped-github-user') {
      console.warn(
        `${jiraKey}: GitHub 담당자 계정 매핑이 없어 Jira 담당자를 변경하지 않습니다.`,
      )
    }
    if (plan.update) {
      await jira(`/rest/api/3/issue/${jiraKey}/assignee`, {
        method: 'PUT',
        body: JSON.stringify({ accountId: plan.accountId }),
      })
    }
  }
}

async function syncCommentEvent(event) {
  if (event.issue.pull_request || event.action !== 'created') return
  const [jiraKey] = extractJiraKeys(event.issue.title, event.issue.body)
  if (!jiraKey || isSyncedGithubComment(event.comment.body)) return
  const body = `${event.comment.body}\n\n${jiraCommentMarker(event.comment.id)}\nGitHub의 ${event.comment.user.login} 댓글에서 동기화됨`
  await jira(`/rest/api/3/issue/${jiraKey}/comment`, {
    method: 'POST',
    body: JSON.stringify({ body: textToAdf(body) }),
  })
}

async function syncPullRequestEvent(event) {
  const keys = extractJiraKeys(
    event.pull_request.title,
    event.pull_request.body,
    event.pull_request.head.ref,
  )
  if (
    ['opened', 'reopened', 'ready_for_review', 'synchronize'].includes(
      event.action,
    )
  ) {
    for (const key of keys) await transitionJira(key, 'indeterminate')
  }
}

async function githubEvent() {
  requireEnvironment([
    'GITHUB_EVENT_PATH',
    'GITHUB_EVENT_NAME',
    'GITHUB_REPOSITORY',
    'JIRA_BASE_URL',
    'JIRA_USER_EMAIL',
    'JIRA_API_TOKEN',
  ])
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'),
  )
  if (process.env.GITHUB_EVENT_NAME === 'issues') await syncIssueEvent(event)
  if (process.env.GITHUB_EVENT_NAME === 'issue_comment') {
    await syncCommentEvent(event)
  }
  if (process.env.GITHUB_EVENT_NAME === 'pull_request_target') {
    await syncPullRequestEvent(event)
  }
}

async function completeFromText() {
  requireEnvironment([
    'SYNC_TEXT',
    'GITHUB_REPOSITORY',
    'GH_TOKEN',
    'JIRA_BASE_URL',
    'JIRA_USER_EMAIL',
    'JIRA_API_TOKEN',
  ])
  for (const jiraKey of extractJiraKeys(process.env.SYNC_TEXT)) {
    await transitionJira(jiraKey, 'done')
    const issue = await findGithubIssue(jiraKey)
    if (issue && issue.state !== 'closed') {
      await github(`/repos/${owner}/${repo}/issues/${issue.number}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' }),
      })
    }
  }
}

if (command === 'poll') await jiraPoll()
else if (command === 'event') await githubEvent()
else if (command === 'complete') await completeFromText()
else throw new Error('사용법: jira-github-sync.mjs <poll|event|complete>')
