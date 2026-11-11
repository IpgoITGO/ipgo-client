import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateDeployment } from './validate-dev-deployment.mjs'

const sha = 'a'.repeat(40)
const approved = {
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/dev',
  EXPECTED_SHA: sha,
  GITHUB_SHA: sha,
}

test('승인한 dev SHA의 수동 실행만 통과한다', () => {
  assert.doesNotThrow(() => validateDeployment(approved))
  for (const change of [
    { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/heads/main' },
    { EXPECTED_SHA: 'b'.repeat(40) },
    { EXPECTED_SHA: 'a78bfaf' },
    { EXPECTED_SHA: undefined },
    { EXPECTED_SHA: '$(touch /tmp/untrusted)' },
  ])
    assert.throws(() => validateDeployment({ ...approved, ...change }))
})

test('PR와 push는 검증만 수행하며 Git 연동 배포도 차단한다', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/vercel-development.yml', import.meta.url),
    'utf8',
  )
  assert.match(workflow, /pull_request:/)
  assert.match(workflow, /run: npm run ci:check/)
  assert.match(workflow, /run: npm run build:ci/)
  assert.match(
    workflow,
    /deploy:\s+if: github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/dev'\s+needs: verify/,
  )
  assert.ok(
    workflow.indexOf('validate-dev-deployment.mjs') <
      workflow.indexOf('vercel pull'),
  )
  const config = JSON.parse(
    readFileSync(new URL('../../vercel.json', import.meta.url)),
  )
  assert.equal(config.git.deploymentEnabled, false)
})

test('수동 dev 배포만 중복 일반 빌드를 생략하고 최종 환경 빌드는 유지한다', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/vercel-development.yml', import.meta.url),
    'utf8',
  )
  assert.match(
    workflow,
    /name: Build CI source outside a dev deployment\s+if: github.event_name != 'workflow_dispatch' \|\| github.ref != 'refs\/heads\/dev'\s+run: npm run build:ci/,
  )
  assert.match(workflow, /run: npm run ci:check/)
  assert.match(
    workflow,
    /node scripts\/automation\/prepare-vercel-build.mjs preview/,
  )
  assert.ok(
    workflow.indexOf('vercel build') <
      workflow.indexOf('vercel deploy --prebuilt'),
  )
  assert.ok(
    workflow.indexOf('validate-dev-deployment.mjs') <
      workflow.indexOf('vercel pull'),
  )
})
