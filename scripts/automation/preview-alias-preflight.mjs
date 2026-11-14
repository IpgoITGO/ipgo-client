import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { validateDeployment } from './validate-dev-deployment.mjs'
import {
  aliases,
  aliasReader,
  validatePreparedBackup,
} from './switch-dev-aliases.mjs'

function failure(code, details = {}) {
  return Object.assign(new Error(code), { safeCode: code, ...details })
}

export function previewDomainReader(env, request = fetch) {
  if (!env.VERCEL_TOKEN || !env.VERCEL_PROJECT_ID || !env.VERCEL_ORG_ID)
    throw failure('MISSING_VERCEL_CONTEXT')
  return async () => {
    const url = new URL(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}/domains`,
    )
    url.searchParams.set('limit', '100')
    if (env.VERCEL_ORG_ID.startsWith('team_'))
      url.searchParams.set('teamId', env.VERCEL_ORG_ID)
    const response = await request(url, {
      headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok)
      throw failure('DOMAIN_READ_FAILED', { status: response.status })
    const value = await response.json()
    // 목록이 잘린 상태를 안전한 설정으로 판단하지 않는다.
    if (!Array.isArray(value.domains) || value.pagination?.next != null)
      throw failure('DOMAIN_LIST_INCOMPLETE')
    return value.domains
  }
}

export async function preparePreviewAliases({ env, readAlias, readDomains }) {
  validateDeployment(env)
  const previous = await Promise.all(aliases.map(readAlias))
  const backup = {
    version: 1,
    sha: env.EXPECTED_SHA,
    projectId: env.VERCEL_PROJECT_ID,
    orgId: env.VERCEL_ORG_ID,
    aliases: Object.fromEntries(
      aliases.map((alias, i) => [alias, previous[i]]),
    ),
  }
  validatePreparedBackup(backup, env)
  const domains = await readDomains()
  if (
    !Array.isArray(domains) ||
    domains.some(
      (domain) =>
        typeof domain.name !== 'string' ||
        !/^(?:\*\.)?[a-z0-9.-]+$/i.test(domain.name) ||
        (domain.gitBranch != null && typeof domain.gitBranch !== 'string'),
    )
  )
    throw failure('INVALID_DOMAIN_CONTEXT')
  const unsafeDomains = domains
    .filter((domain) => domain.gitBranch === 'dev')
    .map((domain) => domain.name)
  if (unsafeDomains.length)
    throw failure('PREVIEW_DOMAIN_AUTO_ASSIGN', { unsafeDomains })
  return backup
}

async function main() {
  if (!process.env.ALIAS_BACKUP_FILE) throw failure('MISSING_ALIAS_BACKUP')
  const backup = await preparePreviewAliases({
    env: process.env,
    readAlias: aliasReader(process.env),
    readDomains: previewDomainReader(process.env),
  })
  writeFileSync(process.env.ALIAS_BACKUP_FILE, JSON.stringify(backup) + '\n', {
    mode: 0o600,
    flag: 'wx',
  })
  console.log(JSON.stringify({ aliasBackup: backup.aliases }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(
      JSON.stringify({
        passed: false,
        phase: 'preview_preflight',
        code: error.safeCode ?? 'PREVIEW_PREFLIGHT_FAILED',
        httpStatus: Number.isInteger(error.status) ? error.status : null,
        unsafeDomains: error.unsafeDomains,
      }),
    )
    process.exitCode = 1
  })
