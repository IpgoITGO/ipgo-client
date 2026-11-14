import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { validateDeployment } from './validate-dev-deployment.mjs'

export const aliases = ['ipgo-client-dev.vercel.app', 'ipgo-dev.iwhya.kr']

export function validateAliasSnapshot(value) {
  if (
    !value ||
    Object.keys(value).length !== aliases.length ||
    aliases.some(
      (alias) =>
        !/^dpl_[A-Za-z0-9]+$/.test(value[alias]?.id ?? '') ||
        typeof value[alias]?.url !== 'string',
    )
  )
    throw new Error('INVALID_ALIAS_SNAPSHOT')
  for (const alias of aliases) deploymentUrl(value[alias].url)
  return value
}

export function validatePreparedBackup(value, env) {
  if (
    value?.version !== 1 ||
    !/^[0-9a-f]{40}$/.test(value.sha ?? '') ||
    typeof value.projectId !== 'string' ||
    !value.projectId ||
    typeof value.orgId !== 'string' ||
    !value.orgId ||
    value.sha !== env.EXPECTED_SHA ||
    value.projectId !== env.VERCEL_PROJECT_ID ||
    value.orgId !== env.VERCEL_ORG_ID
  )
    throw new Error('BACKUP_CONTEXT_MISMATCH')
  return validateAliasSnapshot(value.aliases)
}

function deploymentUrl(value) {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.origin !== value ||
    !url.hostname.endsWith('.vercel.app')
  )
    throw new Error('INVALID_DEPLOYMENT_URL')
  return value
}

export function aliasReader(env, request = fetch) {
  if (!env.VERCEL_TOKEN || !env.VERCEL_PROJECT_ID || !env.VERCEL_ORG_ID)
    throw new Error('MISSING_VERCEL_CONTEXT')
  return async (alias) => {
    if (!aliases.includes(alias)) throw new Error('UNEXPECTED_ALIAS')
    const url = new URL(`https://api.vercel.com/v4/aliases/${alias}`)
    if (env.VERCEL_ORG_ID.startsWith('team_'))
      url.searchParams.set('teamId', env.VERCEL_ORG_ID)
    const response = await request(url, {
      headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok)
      throw Object.assign(new Error('ALIAS_READ_FAILED'), {
        status: response.status,
      })
    const value = await response.json()
    const id = value.deploymentId ?? value.deployment?.id
    if (
      value.alias !== alias ||
      value.projectId !== env.VERCEL_PROJECT_ID ||
      !/^dpl_[A-Za-z0-9]+$/.test(id ?? '') ||
      typeof value.deployment?.url !== 'string'
    )
      throw new Error('ALIAS_CONTEXT_MISMATCH')
    return { id, url: deploymentUrl(`https://${value.deployment.url}`) }
  }
}

export async function switchDevAliases({
  candidate,
  readAlias,
  setAlias,
  smoke,
  cancelled = () => false,
  recordBackup = () => {},
  previousAliases,
}) {
  deploymentUrl(candidate)
  const before = new Map(
    previousAliases
      ? Object.entries(validateAliasSnapshot(previousAliases))
      : [],
  )
  const touched = []
  let phase = 'candidate_smoke'
  const checkCancellation = () => {
    if (cancelled()) throw new Error('CANCELLED')
  }
  try {
    if (previousAliases) {
      phase = 'published_alias_check'
      const observed = await Promise.allSettled(
        aliases.map((alias) => Promise.resolve().then(() => readAlias(alias))),
      )
      let changed
      observed.forEach((result, index) => {
        const alias = aliases[index]
        if (result.status === 'rejected') {
          changed ??=
            result.reason instanceof Error
              ? result.reason
              : new Error('ALIAS_READ_FAILED')
        } else if (
          result.value.id !== before.get(alias).id ||
          result.value.url !== before.get(alias).url
        ) {
          if (result.value.url === candidate) touched.push(alias)
          changed ??= new Error('ALIAS_CHANGED_DURING_PUBLISH')
        }
      })
      if (changed) throw changed
    }
    checkCancellation()
    phase = 'candidate_smoke'
    await smoke(candidate)
    checkCancellation()
    if (!previousAliases) {
      phase = 'snapshot'
      const previous = await Promise.all(aliases.map(readAlias))
      aliases.forEach((alias, index) => before.set(alias, previous[index]))
      recordBackup(Object.fromEntries(before))
    }
    for (const alias of aliases) {
      phase = 'assign'
      checkCancellation()
      const fresh = await readAlias(alias)
      if (
        fresh.id !== before.get(alias).id ||
        fresh.url !== before.get(alias).url
      )
        throw new Error('ALIAS_CHANGED')
      // 실패한 CLI 호출도 서버에서는 적용됐을 수 있으므로 호출 전에 기록한다.
      touched.push(alias)
      await setAlias(candidate, alias)
    }
    phase = 'verify'
    for (const alias of aliases) {
      checkCancellation()
      if ((await readAlias(alias)).url !== candidate)
        throw new Error('ALIAS_VERIFY_FAILED')
      await smoke(`https://${alias}`)
    }
    checkCancellation()
    return { passed: true, aliases }
  } catch (cause) {
    const restored = []
    const rollbackFailed = []
    const rollbackCauses = []
    for (const alias of touched.toReversed()) {
      try {
        const current = await readAlias(alias)
        const previous = before.get(alias)
        if (current.id !== previous.id || current.url !== previous.url) {
          // 다른 작업이 바꾼 연결은 이전 값으로 덮어쓰지 않는다.
          if (current.url !== candidate)
            throw new Error('ALIAS_CHANGED', { cause })
          await setAlias(previous.url, alias)
        }
        const confirmed = await readAlias(alias)
        if (confirmed.id !== previous.id || confirmed.url !== previous.url)
          throw new Error('ROLLBACK_VERIFY_FAILED', { cause })
        await smoke(`https://${alias}`)
        restored.push(alias)
      } catch (rollbackCause) {
        rollbackFailed.push(alias)
        rollbackCauses.push({ alias, cause: rollbackCause })
      }
    }
    const error = new Error('DEV_ALIAS_SWITCH_FAILED', { cause })
    error.rollbackCauses = rollbackCauses
    error.report = {
      passed: false,
      phase,
      cancelled: cancelled(),
      commandExitCode: Number.isInteger(cause.code) ? cause.code : null,
      httpStatus: Number.isInteger(cause.status) ? cause.status : null,
      restored,
      rollbackFailed,
    }
    throw error
  }
}

async function main() {
  validateDeployment(process.env)
  if (!process.env.ALIAS_BACKUP_FILE) throw new Error('MISSING_ALIAS_BACKUP')
  const previousAliases = validatePreparedBackup(
    JSON.parse(readFileSync(process.env.ALIAS_BACKUP_FILE, 'utf8')),
    process.env,
  )
  let stopped = false
  const stop = () => {
    stopped = true
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  const execute = promisify(execFile)
  try {
    const result = await switchDevAliases({
      previousAliases,
      candidate: process.env.DEPLOYMENT_URL,
      readAlias: aliasReader(process.env),
      setAlias: (url, alias) =>
        execute('vercel', ['alias', 'set', url, alias], {
          timeout: 20_000,
        }),
      smoke: (url) =>
        execute(
          process.execPath,
          [fileURLToPath(new URL('./smoke-test.mjs', import.meta.url))],
          { env: { ...process.env, DEPLOYMENT_URL: url }, timeout: 60_000 },
        ),
      cancelled: () => stopped,
      recordBackup: (backup) =>
        console.log(JSON.stringify({ aliasBackup: backup })),
    })
    console.log(JSON.stringify(result))
  } finally {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    // 인증정보가 포함될 수 있는 CLI stderr/API 본문은 출력하지 않는다.
    console.error(
      JSON.stringify(error.report ?? { passed: false, phase: 'context' }),
    )
    process.exitCode = 1
  })
