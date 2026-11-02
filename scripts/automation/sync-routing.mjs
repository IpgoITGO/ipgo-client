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
  if (config.jiraOnlyKeys && !Array.isArray(config.jiraOnlyKeys)) {
    throw new Error('jiraOnlyKeys 배열이 필요합니다.')
  }
  for (const key of config.jiraOnlyKeys ?? []) {
    if (extractProjectJiraKeys(projectKey, key)[0] !== key) {
      throw new Error(`Jira 전용 키 ${key}를 확인하세요.`)
    }
  }
  for (const field of ['excludedIssues', 'canonicalIssues']) {
    if (
      config[field] !== undefined &&
      (!config[field] ||
        typeof config[field] !== 'object' ||
        Array.isArray(config[field]))
    ) {
      throw new Error(`${field} 객체가 필요합니다.`)
    }
  }
  for (const [target, numbers] of Object.entries(config.excludedIssues ?? {})) {
    if (
      !repositories.has(target) ||
      !Array.isArray(numbers) ||
      numbers.some((number) => !Number.isSafeInteger(number) || number < 1)
    )
      throw new Error(`동기화 제외 Issue 설정 ${target}를 확인하세요.`)
  }
  const managedTargets = new Set()
  for (const [key, binding] of Object.entries(config.canonicalIssues ?? {})) {
    const hasNumber = Object.hasOwn(binding ?? {}, 'number')
    const hasNode = Object.hasOwn(binding ?? {}, 'nodeId')
    if (
      extractProjectJiraKeys(projectKey, key)[0] !== key ||
      !repositories.has(binding?.repository) ||
      !['sync', 'reference'].includes(binding?.mode) ||
      hasNumber === hasNode ||
      (hasNumber &&
        (!Number.isSafeInteger(binding.number) || binding.number < 1)) ||
      (hasNode &&
        (typeof binding.nodeId !== 'string' || !binding.nodeId.trim())) ||
      config.jiraOnlyKeys?.includes(key) ||
      (hasNumber &&
        config.excludedIssues?.[binding.repository]?.includes(binding.number))
    )
      throw new Error(`정본 연결 ${key}를 확인하세요.`)
    if (binding.mode === 'sync') {
      const target = `${binding.repository}:${binding.number ?? binding.nodeId}`
      if (managedTargets.has(target))
        throw new Error('하나의 정본에 여러 Jira 상태를 연결할 수 없습니다.')
      managedTargets.add(target)
    }
  }
}

export function isExcludedGithubIssue(issue, repository, config) {
  if (
    !Number.isSafeInteger(issue.number) ||
    issue.number < 1 ||
    issue.pull_request ||
    config.excludedIssues?.[repository]?.includes(issue.number)
  )
    return true
  // 이관된 옛 URL을 따라가 다른 저장소의 Issue에 쓰지 않는다.
  const location = issue.repository_url ?? issue.html_url ?? issue.url
  if (location) {
    const match = location.match(
      /(?:api\.github\.com\/repos|github\.com)\/([^/]+\/[^/]+)/,
    )
    if (match && match[1].toLowerCase() !== repository.toLowerCase())
      return true
  }
  return false
}

export function isJiraKeySyncEnabled(key, repository, config) {
  if (config.jiraOnlyKeys?.includes(key)) return false
  const binding = config.canonicalIssues?.[key]
  return (
    !binding || (binding.mode === 'sync' && binding.repository === repository)
  )
}

export function matchesCanonicalIssue(issue, binding) {
  return binding.number !== undefined
    ? issue.number === binding.number
    : issue.node_id === binding.nodeId
}

export function canSyncGithubIssue(
  issue,
  key,
  repository,
  config,
  projectKey = 'IPGO',
) {
  if (
    isExcludedGithubIssue(issue, repository, config) ||
    !isJiraKeySyncEnabled(key, repository, config)
  )
    return false
  const owners = Object.entries(config.canonicalIssues ?? {})
    .filter(
      ([, binding]) =>
        binding.mode === 'sync' &&
        binding.repository === repository &&
        matchesCanonicalIssue(issue, binding),
    )
    .map(([owner]) => owner)
  if (owners.length && (owners.length !== 1 || owners[0] !== key)) return false
  const binding = config.canonicalIssues?.[key]
  if (binding) return matchesCanonicalIssue(issue, binding)
  const keys = extractProjectJiraKeys(projectKey, issue.title)
  // 여러 업무를 언급한 계약/총괄 Issue는 자동 상태 전환의 정본으로 추측하지 않는다.
  return keys.length === 1 && keys[0] === key
}

export function releaseJiraKeys(message, projectKey) {
  const lines = String(message ?? '').split(/\r?\n/)
  const headline = lines[0] ?? ''
  // GitHub merge commit은 첫 줄이 merge 안내, 다음 비어 있지 않은 줄이 PR 제목이다.
  const prTitle = /^Merge pull request #\d+ from \S+$/.test(headline)
    ? (lines.slice(1).find((line) => line.trim()) ?? '')
    : ''
  return extractProjectJiraKeys(projectKey, headline, prTitle)
}

export function resolveJiraRepository(issue, config) {
  if (config.jiraOnlyKeys?.includes(issue.key)) return null
  if (config.canonicalIssues?.[issue.key])
    return config.canonicalIssues[issue.key].repository
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
  const eligible = githubIssues.filter(
    (issue) => !isExcludedGithubIssue(issue, repository, routing),
  )
  const byKey = indexGithubIssuesByJiraKey(eligible, projectKey)
  const retiredKeys = new Set(
    githubIssues
      .filter((issue) => isExcludedGithubIssue(issue, repository, routing))
      .flatMap((issue) => extractProjectJiraKeys(projectKey, issue.title)),
  )
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
    const destination = resolveJiraRepository(jiraIssue, routing)
    const binding = routing.canonicalIssues?.[jiraIssue.key]
    if (!isJiraKeySyncEnabled(jiraIssue.key, repository, routing)) {
      skipped.push({
        jiraIssue,
        destination,
        reason: routing.jiraOnlyKeys?.includes(jiraIssue.key)
          ? 'jira-only'
          : 'canonical-reference',
      })
      continue
    }
    const githubIssue = binding
      ? eligible.find((issue) => matchesCanonicalIssue(issue, binding))
      : byKey.get(jiraIssue.key)
    if (
      githubIssue &&
      destination === repository &&
      canSyncGithubIssue(
        githubIssue,
        jiraIssue.key,
        repository,
        routing,
        projectKey,
      )
    ) {
      existing.push({ jiraIssue, githubIssue })
      continue
    }
    let reason = null
    if (binding && !githubIssue) reason = 'canonical-missing'
    else if (githubIssue) reason = 'non-canonical'
    else if (retiredKeys.has(jiraIssue.key)) reason = 'retired-binding'
    else if (!destination) reason = 'manual-routing'
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
