import {
  assertAutoCreateLimit,
  extractProjectJiraKeys,
  indexGithubIssuesByJiraKey,
  shouldAutoCreateGithubIssue,
} from './sync-lib.mjs'

export function validateRoutingConfig(config, repository, projectKey) {
  extractProjectJiraKeys(projectKey)
  if (!Array.isArray(config?.rules) || config.rules.length === 0) {
    throw new Error('Jira 저장소 분류 rules가 필요합니다.')
  }
  for (const rule of config.rules) {
    if (
      !/^[\w.-]+\/[\w.-]+$/.test(rule?.repository ?? '') ||
      !Array.isArray(rule.summaryPrefixes) ||
      rule.summaryPrefixes.length === 0 ||
      rule.summaryPrefixes.some(
        (prefix) => typeof prefix !== 'string' || !/^\[[^\]]+\]$/.test(prefix),
      )
    ) {
      throw new Error(
        'Jira 저장소 분류 rule의 repository와 summaryPrefixes를 확인하세요.',
      )
    }
  }
  const repositories = new Set(config.rules.map((rule) => rule.repository))
  if (!repositories.has(repository)) {
    throw new Error(`분류 설정에 현재 저장소 ${repository}가 없습니다.`)
  }
  if (
    !config.issueRepositories ||
    typeof config.issueRepositories !== 'object' ||
    Array.isArray(config.issueRepositories)
  ) {
    throw new Error('Jira 저장소 분류 issueRepositories 객체가 필요합니다.')
  }
  for (const [key, target] of Object.entries(config.issueRepositories)) {
    if (
      extractProjectJiraKeys(projectKey, key)[0] !== key ||
      (target !== null && !repositories.has(target))
    ) {
      throw new Error(`Jira 저장소 명시적 연결 ${key}를 확인하세요.`)
    }
  }
}

export function resolveJiraRepository(issue, config) {
  if (Object.hasOwn(config.issueRepositories, issue.key)) {
    return config.issueRepositories[issue.key]
  }
  const summary = (issue.fields.summary ?? '').trim()
  const matches = new Set(
    config.rules
      .filter((rule) =>
        rule.summaryPrefixes.some((prefix) => summary.startsWith(prefix)),
      )
      .map((rule) => rule.repository),
  )
  return matches.size === 1 ? [...matches][0] : null
}

export function planJiraSync({
  jiraIssues,
  githubIssues,
  repository,
  projectKey,
  routing,
  autoCreateAfter,
  autoCreateLimit,
}) {
  validateRoutingConfig(routing, repository, projectKey)
  assertAutoCreateLimit(0, autoCreateLimit)
  // 설정 오류는 기존 작업을 쓰기 전에 확인한다.
  shouldAutoCreateGithubIssue({
    jiraCreatedAt: autoCreateAfter,
    autoCreateAfter,
  })
  const byKey = indexGithubIssuesByJiraKey(githubIssues, projectKey)
  const existing = []
  const candidates = []
  const skipped = []

  // 페이지 경계에서 같은 작업이 다시 나타나도 한 번만 처리한다.
  const uniqueIssues = new Map(jiraIssues.map((issue) => [issue.key, issue]))
  for (const jiraIssue of uniqueIssues.values()) {
    if (
      extractProjectJiraKeys(projectKey, jiraIssue.key)[0] !== jiraIssue.key
    ) {
      continue
    }
    const githubIssue = byKey.get(jiraIssue.key)
    // 과거에 연결된 다른 영역의 Issue도 이동하거나 연결을 끊지 않는다.
    if (githubIssue) {
      existing.push({ jiraIssue, githubIssue })
      continue
    }
    const destination = resolveJiraRepository(jiraIssue, routing)
    let reason = null
    if (!destination) reason = 'manual-routing'
    else if (destination !== repository) reason = 'other-repository'
    else if (
      !shouldAutoCreateGithubIssue({
        jiraCreatedAt: jiraIssue.fields.created,
        autoCreateAfter,
      })
    ) {
      reason = 'before-cutoff'
    }
    if (reason) skipped.push({ jiraIssue, destination, reason })
    else candidates.push(jiraIssue)
  }

  const creationBlocked = candidates.length > autoCreateLimit
  return {
    existing,
    candidates,
    creationBlocked,
    create: creationBlocked ? [] : candidates,
    deferred: creationBlocked ? candidates : [],
    skipped,
  }
}
