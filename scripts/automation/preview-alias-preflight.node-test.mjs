import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  preparePreviewAliases,
  previewDomainReader,
} from './preview-alias-preflight.mjs'
import { aliases, validatePreparedBackup } from './switch-dev-aliases.mjs'

const env = {
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/dev',
  EXPECTED_SHA: 'a'.repeat(40),
  GITHUB_SHA: 'a'.repeat(40),
  VERCEL_TOKEN: 'fixture-private-token',
  VERCEL_PROJECT_ID: 'prj_fixture',
  VERCEL_ORG_ID: 'team_fixture',
}

function fixture(
  domains = [{ name: 'production.example.com', gitBranch: null }],
) {
  const events = []
  return {
    events,
    options: {
      env,
      readAlias: async (alias) => {
        events.push(alias)
        return { id: 'dpl_old', url: 'https://old.vercel.app' }
      },
      readDomains: async () => {
        events.push('domains')
        return domains
      },
    },
  }
}

test('게시 전에 두 원본 연결과 승인 SHA·project·org를 묶는다', async () => {
  const f = fixture()
  const backup = await preparePreviewAliases(f.options)
  assert.deepEqual(f.events, [...aliases, 'domains'])
  assert.equal(backup.sha, env.EXPECTED_SHA)
  assert.equal(backup.projectId, env.VERCEL_PROJECT_ID)
  assert.deepEqual(Object.keys(validatePreparedBackup(backup, env)), aliases)
})

test('두 고정 주소 외에도 dev 자동 연결이 하나라도 있으면 게시 전에 차단한다', async () => {
  for (const name of [...aliases, 'other-dev.example.com']) {
    await assert.rejects(
      preparePreviewAliases(fixture([{ name, gitBranch: 'dev' }]).options),
      (error) => {
        assert.equal(error.safeCode, 'PREVIEW_DOMAIN_AUTO_ASSIGN')
        assert.deepEqual(error.unsafeDomains, [name])
        return true
      },
    )
  }
})

test('승인 밖 ref·잘못된 도메인 응답은 안전한 구성으로 취급하지 않는다', async () => {
  const f = fixture()
  await assert.rejects(
    preparePreviewAliases({
      ...f.options,
      env: { ...env, GITHUB_REF: 'refs/heads/main' },
    }),
  )
  assert.deepEqual(f.events, [])
  for (const domains of [
    undefined,
    [{ name: 'bad\nname' }],
    [{ name: 'ok.example.com', gitBranch: 1 }],
  ]) {
    await assert.rejects(
      preparePreviewAliases({
        ...fixture().options,
        readDomains: async () => domains,
      }),
    )
  }
})

test('도메인 API는 고정 origin·project·team·시간제한·redirect 거부를 유지한다', async () => {
  const read = previewDomainReader(env, async (url, options) => {
    assert.equal(url.origin, 'https://api.vercel.com')
    assert.equal(url.pathname, '/v9/projects/prj_fixture/domains')
    assert.equal(url.searchParams.get('teamId'), 'team_fixture')
    assert.equal(url.searchParams.get('limit'), '100')
    assert.equal(options.redirect, 'error')
    assert.equal(options.headers.Authorization, 'Bearer fixture-private-token')
    assert.ok(options.signal instanceof AbortSignal)
    return {
      ok: true,
      json: async () => ({ domains: [], pagination: { next: null } }),
    }
  })
  assert.deepEqual(await read(), [])
})

test('API 실패·잘린 목록·잘못된 목록은 게시를 차단하며 응답 본문을 노출하지 않는다', async () => {
  const failure = previewDomainReader(env, async () => ({
    ok: false,
    status: 403,
    json: () => {
      throw new Error('fixture-private-token')
    },
  }))
  await assert.rejects(failure(), (error) => {
    assert.equal(error.safeCode, 'DOMAIN_READ_FAILED')
    assert.equal(error.status, 403)
    assert.ok(!error.message.includes(env.VERCEL_TOKEN))
    return true
  })
  for (const body of [{ domains: [], pagination: { next: 123 } }, {}]) {
    await assert.rejects(
      previewDomainReader(env, async () => ({
        ok: true,
        json: async () => body,
      }))(),
    )
  }
})

test('백업의 다른 SHA·project·org와 빠진 주소는 전환에 재사용하지 않는다', async () => {
  const backup = await preparePreviewAliases(fixture().options)
  for (const patch of [
    { sha: 'b'.repeat(40) },
    { projectId: 'prj_other' },
    { orgId: 'team_other' },
    { aliases: {} },
  ]) {
    assert.throws(() => validatePreparedBackup({ ...backup, ...patch }, env))
  }
})

test('workflow는 동일 백업을 게시 전에 준비하고 성공한 후보만 전환한다', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/vercel-development.yml', import.meta.url),
    'utf8',
  )
  const preflight = workflow.indexOf(
    'run: node scripts/automation/preview-alias-preflight.mjs',
  )
  const publish = workflow.indexOf('vercel deploy --prebuilt --yes')
  const switchStep = workflow.indexOf(
    'run: node scripts/automation/switch-dev-aliases.mjs',
  )
  assert.ok(preflight >= 0 && preflight < publish && publish < switchStep)
  assert.equal(
    workflow.match(
      / {10}ALIAS_BACKUP_FILE: \$\{\{ runner.temp \}\}\/dev-alias-backup.json/g,
    )?.length,
    2,
  )
  assert.doesNotMatch(workflow, /continue-on-error:|if: always\(\)/)
  assert.doesNotMatch(workflow, /vercel deploy[^\n]*(?:--skip-domain|--prod)/)
})
