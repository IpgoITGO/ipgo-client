import assert from 'node:assert/strict'
import test from 'node:test'
import { verifySourceCi } from './verify-source-ci.mjs'

const sha = 'a'.repeat(40)
const env = {
  GITHUB_REPOSITORY: 'IpgoITGO/ipgo-client',
  GITHUB_SHA: sha,
  EXPECTED_SHA: sha,
  GITHUB_REF: 'refs/heads/dev',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
}
function fixture() {
  const run = {
    id: 71,
    workflow_id: 9,
    repository: { full_name: env.GITHUB_REPOSITORY },
    head_sha: sha,
    head_branch: 'dev',
    event: 'push',
    path: '.github/workflows/vercel-development.yml',
    run_attempt: 2,
    status: 'completed',
    conclusion: 'success',
  }
  const job = {
    run_id: 71,
    run_attempt: 2,
    head_sha: sha,
    status: 'completed',
  }
  return {
    run,
    latest: structuredClone(run),
    listed: { total_count: 1, workflow_runs: [run] },
    jobs: {
      total_count: 2,
      jobs: [
        {
          ...job,
          name: 'verify',
          conclusion: 'success',
          steps: [
            'Run npm ci',
            'Run npm run ci:check',
            'Build CI source outside a dev deployment',
          ].map((name) => ({ name, conclusion: 'success' })),
        },
        { ...job, name: 'deploy', conclusion: 'skipped' },
      ],
    },
  }
}
function request(f) {
  return async (path) => {
    if (path.endsWith('/workflows/vercel-development.yml')) return { id: 9 }
    if (path.includes('/runs?')) return f.listed
    if (path.endsWith('/runs/71')) return f.latest
    assert.ok(path.endsWith('/runs/71/attempts/2/jobs?per_page=100'))
    return f.jobs
  }
}
test('같은 SHA의 push CI에서 전체 검사와 빌드 성공 증거를 재사용한다', async () => {
  assert.deepEqual(await verifySourceCi(env, request(fixture())), {
    source_ci_reused: true,
    source_sha: sha,
    ci_run: 71,
    ci_attempt: 2,
  })
})
test('PR·다른 SHA/저장소/workflow·실패·부분 페이지·빠진 검사를 거부한다', async () => {
  const changes = [
    (f) => (f.run.event = 'pull_request'),
    (f) => (f.run.head_sha = 'b'.repeat(40)),
    (f) => (f.run.repository.full_name = 'other/repo'),
    (f) => (f.run.path = '.github/workflows/other.yml'),
    (f) => (f.run.workflow_id = 10),
    (f) => (f.run.conclusion = 'failure'),
    (f) => (f.listed.total_count = 101),
    (f) => (f.jobs.jobs[0].steps[1].conclusion = 'skipped'),
    (f) => (f.jobs.jobs[0].head_sha = 'b'.repeat(40)),
    (f) => (f.jobs.jobs[0].run_attempt = 1),
    (f) => (f.jobs.jobs[0].steps.length = 0),
    (f) => (f.jobs.total_count = 3),
    (f) => (f.jobs.jobs[1].conclusion = 'success'),
    (f) => (f.latest.run_attempt = 3),
    (f) => (f.latest.status = 'in_progress'),
    (f) => {
      f.listed.workflow_runs.push({ ...f.run, id: 72, conclusion: 'failure' })
      f.listed.total_count = 2
    },
  ]
  for (const change of changes) {
    const f = fixture()
    change(f)
    await assert.rejects(verifySourceCi(env, request(f)))
  }
  await assert.rejects(
    verifySourceCi(
      { ...env, EXPECTED_SHA: 'b'.repeat(40) },
      request(fixture()),
    ),
  )
  await assert.rejects(
    verifySourceCi(env, async () => {
      throw new Error('synthetic API failure')
    }),
  )
})
