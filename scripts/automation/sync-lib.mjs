const JIRA_KEY_PATTERN = /\b[A-Z][A-Z0-9]+-\d+\b/g

export const SYNC_MARKER_PREFIX = '<!-- jira-github-sync '

export function extractJiraKeys(...values) {
  return [
    ...new Set(
      values
        .filter((value) => typeof value === 'string')
        .flatMap((value) => value.match(JIRA_KEY_PATTERN) ?? []),
    ),
  ]
}

export function indexGithubIssuesByJiraKey(issues = []) {
  const byKey = new Map()

  for (const issue of issues) {
    if (issue.pull_request) continue
    for (const key of extractJiraKeys(issue.title)) {
      if (!byKey.has(key)) byKey.set(key, issue)
    }
  }
  return byKey
}

export function readSyncMarker(body = '') {
  const start = body.indexOf(SYNC_MARKER_PREFIX)
  if (start < 0) return { start: null, due: null }

  const jsonStart = start + SYNC_MARKER_PREFIX.length
  const end = body.indexOf(' -->', jsonStart)
  if (end < 0) return { start: null, due: null }

  try {
    const parsed = JSON.parse(body.slice(jsonStart, end))
    return {
      start: parsed.start ?? null,
      due: parsed.due ?? null,
    }
  } catch {
    return { start: null, due: null }
  }
}

export function writeSyncMarker(body = '', dates) {
  const marker = `${SYNC_MARKER_PREFIX}${JSON.stringify(dates)} -->`
  const pattern = /<!-- jira-github-sync \{[^\n]*\} -->/
  if (pattern.test(body)) return body.replace(pattern, marker)
  return `${body.trimEnd()}\n\n${marker}\n`
}

export function resolveDateSync({ jiraValue, githubValue, previousValue }) {
  const jiraChanged = jiraValue !== previousValue
  const githubChanged = githubValue !== previousValue

  if (jiraChanged && githubChanged && jiraValue !== githubValue) {
    return { finalValue: jiraValue, update: 'github', conflict: true }
  }
  if (jiraChanged) {
    return { finalValue: jiraValue, update: 'github', conflict: false }
  }
  if (githubChanged) {
    return { finalValue: githubValue, update: 'jira', conflict: false }
  }
  return { finalValue: previousValue, update: null, conflict: false }
}

export function shouldAutoCreateGithubIssue({
  jiraCreatedAt,
  autoCreateAfter,
}) {
  const createdAt = Date.parse(jiraCreatedAt)
  const cutoff = Date.parse(autoCreateAfter)

  if (!Number.isFinite(createdAt)) {
    throw new Error(`Jira 생성일을 해석할 수 없습니다: ${jiraCreatedAt}`)
  }
  if (!Number.isFinite(cutoff)) {
    throw new Error(
      `JIRA_AUTO_CREATE_AFTER를 ISO 8601 형식으로 설정하세요: ${autoCreateAfter}`,
    )
  }
  return createdAt >= cutoff
}

export function assertAutoCreateLimit(count, limit) {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(
      `JIRA_AUTO_CREATE_LIMIT는 0 이상의 정수여야 합니다: ${limit}`,
    )
  }
  if (count > limit) {
    throw new Error(
      `자동 생성 후보가 ${count}건으로 안전 한도 ${limit}건을 초과했습니다. ` +
        '범위와 기존 연결을 확인한 뒤 한도를 조정하세요.',
    )
  }
}

export function isSyncedGithubComment(body = '') {
  return body.includes('<!-- sync:jira-comment:')
}

export function isSyncedJiraComment(text = '') {
  return text.includes('[sync:github-comment:')
}

export function githubCommentMarker(jiraCommentId) {
  return `<!-- sync:jira-comment:${jiraCommentId} -->`
}

export function jiraCommentMarker(githubCommentId) {
  return `[sync:github-comment:${githubCommentId}]`
}
