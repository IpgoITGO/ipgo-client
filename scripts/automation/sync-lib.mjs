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
