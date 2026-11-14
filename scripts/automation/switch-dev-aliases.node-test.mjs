import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
  aliases,
  aliasReader,
  switchDevAliases,
} from './switch-dev-aliases.mjs'

const candidate = 'https://candidate.vercel.app'
const old = aliases.map((_, index) => ({
  id: `dpl_old${index}`,
  url: `https://old-${index}.vercel.app`,
}))

function fixture() {
  const state = new Map(aliases.map((alias, index) => [alias, old[index]]))
  const events = []
  const options = {
    candidate,
    readAlias: async (alias) => {
      events.push(['read', alias])
      return state.get(alias)
    },
    setAlias: async (url, alias) => {
      events.push(['set', url, alias])
      state.set(
        alias,
        url === candidate
          ? { id: 'dpl_new', url }
          : old.find((o) => o.url === url),
      )
    },
    smoke: async (url) => {
      events.push(['smoke', url])
    },
    recordBackup: (value) => {
      events.push(['backup', value])
    },
  }
  return { state, events, options }
}

async function failure(options) {
  let report
  await assert.rejects(switchDevAliases(options), (error) => {
    assert.equal(error.message, 'DEV_ALIAS_SWITCH_FAILED')
    assert.ok(error.cause instanceof Error)
    report = error.report
    return true
  })
  return report
}

test('후보 검사·각 주소 백업 뒤 전환하고 두 API 연결/HTTP를 후검증한다', async () => {
  const f = fixture()
  assert.equal((await switchDevAliases(f.options)).passed, true)
  assert.deepEqual(f.events[0], ['smoke', candidate])
  const sets = f.events.filter(([kind]) => kind === 'set')
  assert.deepEqual(
    sets,
    aliases.map((a) => ['set', candidate, a]),
  )
  assert.ok(
    f.events.findIndex(([k]) => k === 'backup') <
      f.events.findIndex(([k]) => k === 'set'),
  )
  assert.deepEqual(
    f.events.filter(([k]) => k === 'smoke'),
    [candidate, ...aliases.map((a) => `https://${a}`)].map((url) => [
      'smoke',
      url,
    ]),
  )
  assert.ok([...f.state.values()].every((value) => value.id === 'dpl_new'))
})

test('후보 검사나 백업 읽기가 실패하면 주소를 바꾸지 않는다', async () => {
  for (const at of ['smoke', 'readAlias']) {
    const f = fixture()
    f.options[at] = async () => {
      throw Object.assign(new Error('fixture-private-token'), { status: 403 })
    }
    const report = await failure(f.options)
    assert.deepEqual(report.restored, [])
    assert.deepEqual(report.rollbackFailed, [])
    assert.equal(report.httpStatus, 403)
    assert.ok(!f.events.some(([k]) => k === 'set'))
    assert.ok(!JSON.stringify(report).includes('fixture-private-token'))
  }
})

for (const applyBeforeFailure of [false, true]) {
  test(`두 번째 주소 전환 실패(서버적용=${applyBeforeFailure})도 각 이전 연결로 복구한다`, async () => {
    const f = fixture()
    const assign = f.options.setAlias
    f.options.setAlias = async (url, alias) => {
      if (url === candidate && alias === aliases[1]) {
        if (applyBeforeFailure) await assign(url, alias)
        throw Object.assign(new Error('fixture-private-token'), { code: 7 })
      }
      await assign(url, alias)
    }
    const report = await failure(f.options)
    assert.equal(report.phase, 'assign')
    assert.equal(report.commandExitCode, 7)
    assert.deepEqual(report.rollbackFailed, [])
    assert.deepEqual([...f.state.values()], old)
    assert.equal(report.restored.length, 2)
  })
}

test('주소 후검증 실패는 두 주소를 서로 다른 이전 deployment로 복구한다', async () => {
  const f = fixture()
  const smoke = f.options.smoke
  let failed = false
  f.options.smoke = async (url) => {
    if (url === `https://${aliases[1]}` && !failed) {
      failed = true
      throw new Error('HTTP_FAILURE')
    }
    await smoke(url)
  }
  const report = await failure(f.options)
  assert.equal(report.phase, 'verify')
  assert.deepEqual([...f.state.values()], old)
  assert.deepEqual(report.rollbackFailed, [])
})

test('한 주소 복구가 실패해도 나머지는 복구하고 실패를 성공으로 바꾸지 않는다', async () => {
  const f = fixture()
  const set = f.options.setAlias
  const smoke = f.options.smoke
  f.options.setAlias = async (url, alias) => {
    if (url === old[1].url) throw new Error('ROLLBACK_DENIED')
    await set(url, alias)
  }
  f.options.smoke = async (url) => {
    if (
      url === `https://${aliases[0]}` &&
      f.state.get(aliases[0]).url === candidate
    )
      throw new Error('HTTP_FAILURE')
    await smoke(url)
  }
  const report = await failure(f.options)
  assert.deepEqual(report.rollbackFailed, [aliases[1]])
  assert.deepEqual(report.restored, [aliases[0]])
  assert.equal(report.passed, false)
})

test('이전 연결로 복구돼도 HTTP 검증에 실패하면 성공으로 기록하지 않는다', async () => {
  const f = fixture()
  f.options.smoke = async (url) => {
    if (url !== candidate) throw new Error('HTTP_FAILURE')
  }
  const report = await failure(f.options)
  assert.deepEqual([...f.state.values()], old)
  assert.deepEqual(report.restored, [])
  assert.equal(report.rollbackFailed.length, 2)
})

test('복구 뒤 API 연결이 원래 값이 아니면 복구 성공으로 기록하지 않는다', async () => {
  const f = fixture()
  const set = f.options.setAlias
  f.options.setAlias = async (url, alias) => {
    if (url !== candidate) return
    await set(url, alias)
  }
  f.options.smoke = async (url) => {
    if (url !== candidate) throw new Error('HTTP_FAILURE')
  }
  const report = await failure(f.options)
  assert.equal(report.restored.length, 0)
  assert.equal(report.rollbackFailed.length, 2)
})

test('다른 작업이 바꾼 주소는 복구 과정에서 덮어쓰지 않는다', async () => {
  const f = fixture()
  f.options.smoke = async (url) => {
    if (url !== candidate) {
      f.state.set(aliases[0], {
        id: 'dpl_other',
        url: 'https://other.vercel.app',
      })
      throw new Error('CONTEXT_CHANGED')
    }
  }
  const report = await failure(f.options)
  assert.ok(report.rollbackFailed.includes(aliases[0]))
  assert.equal(f.state.get(aliases[0]).id, 'dpl_other')
  assert.ok(
    !f.events.some(
      ([kind, url, alias]) =>
        kind === 'set' && url === old[0].url && alias === aliases[0],
    ),
  )
})

test('쓰기 직전 연결이 달라지면 새 작업을 덮어쓰지 않고 이미 바꾼 주소만 복구한다', async () => {
  const f = fixture()
  const read = f.options.readAlias
  let reads = 0
  f.options.readAlias = async (alias) => {
    if (alias === aliases[1] && ++reads === 2)
      f.state.set(alias, { id: 'dpl_other', url: 'https://other.vercel.app' })
    return read(alias)
  }
  const report = await failure(f.options)
  assert.deepEqual(report.restored, [aliases[0]])
  assert.equal(f.state.get(aliases[1]).id, 'dpl_other')
})

test('전환 도중 취소를 감지하면 이미 변경한 연결을 복구한다', async () => {
  const f = fixture()
  const set = f.options.setAlias
  let stopped = false
  f.options.cancelled = () => stopped
  f.options.setAlias = async (url, alias) => {
    await set(url, alias)
    if (url === candidate) stopped = true
  }
  const report = await failure(f.options)
  assert.equal(report.cancelled, true)
  assert.deepEqual(report.restored, [aliases[0]])
  assert.deepEqual([...f.state.values()], old)
})

test('alias 조회는 고정 API와 team/project 범위를 확인하며 잘못된 응답을 거부한다', async () => {
  const env = {
    VERCEL_TOKEN: 'fixture-token',
    VERCEL_PROJECT_ID: 'prj_fixture',
    VERCEL_ORG_ID: 'team_fixture',
  }
  const body = {
    alias: aliases[0],
    projectId: env.VERCEL_PROJECT_ID,
    deploymentId: 'dpl_old0',
    deployment: { url: 'old-0.vercel.app' },
  }
  const read = aliasReader(env, async (url, options) => {
    assert.equal(url.origin, 'https://api.vercel.com')
    assert.equal(url.pathname, `/v4/aliases/${aliases[0]}`)
    assert.equal(url.searchParams.get('teamId'), env.VERCEL_ORG_ID)
    assert.equal(options.headers.Authorization, 'Bearer fixture-token')
    assert.equal(options.redirect, 'error')
    return { ok: true, json: async () => body }
  })
  assert.deepEqual(await read(aliases[0]), old[0])
  await assert.rejects(read('other.example.test'))
  for (const change of [
    { projectId: 'prj_other' },
    { deploymentId: null },
    { deployment: null },
    { deployment: { url: 'evil.example.test' } },
  ]) {
    const invalid = aliasReader(env, async () => ({
      ok: true,
      json: async () => ({ ...body, ...change }),
    }))
    await assert.rejects(invalid(aliases[0]))
  }
  await assert.rejects(
    aliasReader(env, async () => ({ ok: false, status: 403 }))(aliases[0]),
    { status: 403 },
  )
  assert.throws(() => aliasReader({}))
})

test('잘못된 후보 URL은 외부 요청이나 전환 없이 거부한다', async () => {
  for (const candidate of [
    'http://x.vercel.app',
    'https://evil.example.test',
    'https://x.vercel.app/path',
    'https://user:password@x.vercel.app',
  ]) {
    const f = fixture()
    await assert.rejects(switchDevAliases({ ...f.options, candidate }))
    assert.deepEqual(f.events, [])
  }
})

test('실제 진입점도 승인 없는 이벤트에서는 배포 명령/네트워크 전에 실패한다', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/automation/switch-dev-aliases.mjs'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: 'push',
        VERCEL_TOKEN: 'fixture-private-token',
      },
    },
  )
  assert.equal(result.status, 1)
  assert.ok(!result.stderr.includes('fixture-private-token'))
  assert.match(result.stderr, /"phase":"context"/)
})

test('workflow는 게시 후 전환기를 호출하며 수동 배포 도중 자동 취소를 막는다', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/vercel-development.yml', import.meta.url),
    'utf8',
  )
  assert.ok(
    workflow.indexOf('vercel deploy --prebuilt') <
      workflow.indexOf('node scripts/automation/switch-dev-aliases.mjs'),
  )
  assert.doesNotMatch(workflow, /vercel alias set/)
  assert.match(
    workflow,
    /cancel-in-progress: \$\{\{ github.event_name != 'workflow_dispatch' \}\}/,
  )
  assert.match(workflow, /EXPECTED_SHA: \$\{\{ inputs.expected_sha \}\}/)
})
