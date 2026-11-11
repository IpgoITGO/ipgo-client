import test from 'node:test'
import assert from 'node:assert/strict'
import {
  runChecks,
  stages,
  automationPlan,
  automationStages,
  currentImpact,
} from './verify-local.mjs'
import { fixtureResponse } from './browser-fixtures.mjs'

const origin = 'http://127.0.0.1:5183'
const response = (route, method = 'GET') =>
  fixtureResponse(new URL(route, origin), method, origin)

test('범위는 dev 공통 기준점부터 비교해 커밋된 앱 변경도 거부한다', () => {
  const base = 'a'.repeat(40)
  const impact = automationImpact()
  const calls = []
  const git = (args) => {
    calls.push(args)
    if (args[0] === 'merge-base') return base
    if (args[0] === 'diff') return 'src/App.tsx\0'
    if (args[0] === 'ls-files') return ''
    if (args[0] === 'show') return JSON.stringify(impact.beforePackage)
    throw new Error('unexpected git operation')
  }
  const actual = currentImpact(git)
  assert.equal(actual.baseSha, base)
  assert.deepEqual(calls[0], ['merge-base', 'HEAD', 'origin/dev'])
  assert.ok(calls.some((args) => args[0] === 'diff' && args.at(-1) === base))
  assert.ok(
    calls.some(
      (args) => args[0] === 'show' && args[1] === `${base}:package.json`,
    ),
  )
  assert.throws(() => automationPlan(actual))
})

function automationImpact() {
  const pkg = {
    dependencies: { react: 'fixed' },
    scripts: {
      'ci:check': 'npm run typecheck && npm test',
      build: 'tsc -b && vite build',
      'build:ci': 'vite build',
      typecheck: 'tsc -b',
    },
  }
  return {
    changedPaths: [
      '.github/workflows/vercel-development.yml',
      'scripts/verification/verify-local.mjs',
    ],
    beforePackage: structuredClone(pkg),
    afterPackage: structuredClone(pkg),
  }
}

test('자동화 전용 경로는 관련 검사를 한 번씩 수행하고 전체 PR CI 의무를 남긴다', async () => {
  const seen = []
  const result = await runChecks({
    profile: 'automation',
    impact: automationImpact(),
    runStage: async (name) => {
      seen.push(name)
      return 0
    },
    fingerprint: () => 'same',
    save: () => {},
  })
  assert.deepEqual(seen, automationStages)
  assert.equal(new Set(seen).size, seen.length)
  assert.equal(result.passed, true)
  assert.equal(result.profile, 'automation')
  assert.equal(result.full_pr_ci_required, true)
  assert.deepEqual(result.omitted_local_checks, [
    'app_ui_tests',
    'synthetic_browser',
  ])
  assert.equal(result.source_fingerprint, 'same')
})

test('앱·lockfile·빌드 설정·검사 명령·의존성 변경은 좁은 검사 경로를 거부한다', () => {
  for (const name of [
    'src/App.tsx',
    'package-lock.json',
    'vite.config.ts',
    'tsconfig.app.json',
    'public/asset.png',
  ]) {
    const impact = automationImpact()
    impact.changedPaths.push(name)
    assert.throws(() => automationPlan(impact))
  }
  for (const change of [
    (p) => {
      p.dependencies.react = 'changed'
    },
    (p) => {
      delete p.scripts['ci:check']
    },
    (p) => {
      p.scripts['ci:check'] = 'echo skipped'
    },
    (p) => {
      p.scripts.build = 'vite build'
    },
    (p) => {
      p.scripts.typecheck = 'echo skipped'
    },
  ]) {
    const impact = automationImpact()
    change(impact.afterPackage)
    assert.throws(() => automationPlan(impact))
  }
  assert.throws(() => automationPlan({}))
})

test('자동화 검사 실패나 실행 중 소스 변경은 재사용 가능한 성공을 만들지 않는다', async () => {
  const seen = []
  const failed = await runChecks({
    profile: 'automation',
    impact: automationImpact(),
    runStage: async (name) => {
      seen.push(name)
      return name === 'typecheck' ? 1 : 0
    },
    fingerprint: () => 'same',
    save: () => {},
  })
  assert.equal(failed.passed, false)
  assert.deepEqual(seen, automationStages.slice(0, 3))
  let n = 0
  const changed = await runChecks({
    profile: 'automation',
    impact: automationImpact(),
    runStage: async () => 0,
    fingerprint: () => String(n++),
    save: () => {},
  })
  assert.equal(changed.source_unchanged, false)
  assert.equal(changed.passed, false)
})

test('기존 전체 검사·빌드와 브라우저를 순서대로 보존하고 결과를 모은다', async () => {
  const seen = [],
    saved = []
  const result = await runChecks({
    runStage: async (name) => {
      seen.push(name)
      return 0
    },
    fingerprint: () => 'same',
    save: (r) => saved.push(structuredClone(r)),
  })
  assert.deepEqual(seen, [
    'format:check',
    'verification:test',
    'ci:check',
    'build',
    'verify:browser',
  ])
  assert.equal(result.passed, true)
  assert.equal(saved[0].stages[0].status, 'running')
  assert.equal(saved.at(-1).passed, true)
  assert.equal(result.actual_savings, 'not_measured')
  assert.equal(result.deployment, false)
})

test('포맷 실패는 전체 검사 전에 중단하고 성공으로 기록하지 않는다', async () => {
  const seen = []
  const result = await runChecks({
    runStage: async (name) => {
      seen.push(name)
      return 2
    },
    fingerprint: () => 'same',
    save: () => {},
  })
  assert.deepEqual(seen, ['format:check'])
  assert.equal(result.passed, false)
  assert.equal(result.stages[0].exit_code, 2)
})

test('전체 검사 실패 뒤 빌드·브라우저를 실행하지 않는다', async () => {
  const seen = []
  const result = await runChecks({
    runStage: async (name) => {
      seen.push(name)
      return name === 'ci:check' ? 1 : 0
    },
    fingerprint: () => 'same',
    save: () => {},
  })
  assert.equal(result.passed, false)
  assert.deepEqual(seen, stages.slice(0, 3))
})

test('브라우저 실패도 전체 검증 실패로 남긴다', async () => {
  const result = await runChecks({
    runStage: async (name) => (name === 'verify:browser' ? 1 : 0),
    fingerprint: () => 'same',
    save: () => {},
  })
  assert.equal(result.passed, false)
  assert.equal(result.stages.at(-1).status, 'failed')
})

test('실행 중 소스 변경이 있으면 모든 단계 통과여도 결과를 무효화한다', async () => {
  let n = 0
  const result = await runChecks({
    runStage: async () => 0,
    fingerprint: () => String(n++),
    save: () => {},
  })
  assert.equal(result.source_unchanged, false)
  assert.equal(result.passed, false)
})

test('검사 도구 자체 오류는 원문 노출 없이 실패 처리한다', async () => {
  const result = await runChecks({
    runStage: async () => {
      throw new Error('fixture-private-value')
    },
    fingerprint: () => 'same',
    save: () => {},
  })
  assert.equal(result.passed, false)
  assert.ok(!JSON.stringify(result).includes('fixture-private-value'))
})

test('외부 주소·알 수 없는 API·예상 밖 쓰기는 실제 네트워크로 넘기지 않는다', () => {
  assert.equal(
    response('https://example.test/api/auth/me').blocked,
    'EXTERNAL_ORIGIN',
  )
  assert.equal(
    response('http://127.0.0.1.evil.test:5183/api/auth/me').blocked,
    'EXTERNAL_ORIGIN',
  )
  assert.equal(response('/api/unknown').blocked, 'UNMOCKED_API')
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
    assert.equal(
      response('/api/products/27/detail', method).blocked,
      'UNEXPECTED_API_WRITE',
    )
  assert.equal(response('/src/main.tsx').asset, true)
  assert.equal(response('https://fonts.googleapis.com/css2').body, '')
})

test('합성 인증·주변 API와 작년0/기록없음·실패 이유를 반복 사용한다', () => {
  for (const route of [
    '/api/auth/me',
    '/api/billing/subscription',
    '/api/dashboard/replenishment-needs',
    '/api/expiry',
    '/api/planned-receipts',
    '/api/auth/csrf',
    '/api/settings/storage-cost',
    '/api/planned-quantities',
    '/api/results/17/scenarios',
    '/api/results/17/insight',
  ])
    assert.equal(response(route).contentType, 'application/json')
  assert.equal(
    JSON.parse(response('/api/auth/refresh', 'POST').body).accessToken,
    'fixture-only',
  )
  const detail = JSON.parse(response('/api/products/27/detail').body)
  assert.deepEqual(
    detail.trend.map((d) => d.lastYearOutboundQty),
    [5000, null, 0, 20],
  )
  assert.ok(
    JSON.parse(response('/api/uploads/15').body).error.reason.includes('(3개)'),
  )
})
