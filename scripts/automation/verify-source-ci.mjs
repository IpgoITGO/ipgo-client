import { pathToFileURL } from 'node:url'
import { validateDeployment } from './validate-dev-deployment.mjs'

const workflow = '.github/workflows/vercel-development.yml'
const required = [
  'Run npm ci',
  'Run npm run ci:check',
  'Build CI source outside a dev deployment',
]

function requireEvidence(value, code) {
  if (!value) throw new Error(code)
}

function sourceRun(run, env, workflowId) {
  requireEvidence(
    run.repository?.full_name === env.GITHUB_REPOSITORY &&
      run.head_sha === env.GITHUB_SHA &&
      run.head_branch === 'dev' &&
      run.event === 'push' &&
      run.path === workflow &&
      run.workflow_id === workflowId &&
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      Number.isSafeInteger(run.run_attempt) &&
      run.run_attempt > 0,
    'SOURCE_CI_IDENTITY_OR_RESULT',
  )
}

export async function verifySourceCi(env, request) {
  validateDeployment(env)
  requireEvidence(
    env.GITHUB_REPOSITORY === 'IpgoITGO/ipgo-client',
    'SOURCE_CI_REPOSITORY',
  )
  const base = `/repos/${env.GITHUB_REPOSITORY}/actions`
  const identity = await request(`${base}/workflows/vercel-development.yml`)
  requireEvidence(Number.isSafeInteger(identity.id), 'SOURCE_CI_WORKFLOW')
  const listed = await request(
    `${base}/workflows/vercel-development.yml/runs?event=push&branch=dev&head_sha=${env.GITHUB_SHA}&per_page=100`,
  )
  requireEvidence(
    listed.total_count > 0 &&
      listed.total_count === listed.workflow_runs?.length,
    'SOURCE_CI_LIST_INCOMPLETE',
  )
  const run = [...listed.workflow_runs].sort((a, b) => b.id - a.id)[0]
  sourceRun(run, env, identity.id)
  requireEvidence(Number.isSafeInteger(run.id), 'SOURCE_CI_RUN')
  const jobs = await request(
    `${base}/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
  )
  requireEvidence(
    jobs.total_count === 2 &&
      jobs.jobs?.length === 2 &&
      jobs.jobs.every(
        (job) =>
          job.run_id === run.id &&
          job.run_attempt === run.run_attempt &&
          job.head_sha === env.GITHUB_SHA &&
          job.status === 'completed',
      ),
    'SOURCE_CI_JOBS_INCOMPLETE',
  )
  const verify = jobs.jobs.filter((job) => job.name === 'verify')
  const deploy = jobs.jobs.filter((job) => job.name === 'deploy')
  requireEvidence(
    verify.length === 1 &&
      verify[0].conclusion === 'success' &&
      deploy.length === 1 &&
      deploy[0].conclusion === 'skipped' &&
      required.every(
        (name) =>
          verify[0].steps?.filter(
            (step) => step.name === name && step.conclusion === 'success',
          ).length === 1,
      ) &&
      !verify[0].steps.some((step) =>
        ['failure', 'cancelled', 'timed_out'].includes(step.conclusion),
      ),
    'SOURCE_CI_REQUIRED_CHECKS',
  )
  // A rerun starting while jobs are read invalidates the old successful attempt.
  const latest = await request(`${base}/runs/${run.id}`)
  sourceRun(latest, env, identity.id)
  requireEvidence(
    latest.id === run.id && latest.run_attempt === run.run_attempt,
    'SOURCE_CI_ATTEMPT_CHANGED',
  )
  return {
    source_ci_reused: true,
    source_sha: env.GITHUB_SHA,
    ci_run: run.id,
    ci_attempt: run.run_attempt,
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const request = async (path) => {
      requireEvidence(process.env.GH_TOKEN, 'SOURCE_CI_AUTH')
      const response = await fetch(`https://api.github.com${path}`, {
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      })
      requireEvidence(response.ok, 'SOURCE_CI_API')
      return response.json()
    }
    console.log(JSON.stringify(await verifySourceCi(process.env, request)))
  } catch {
    console.error('SOURCE_CI_EVIDENCE_REJECTED')
    process.exitCode = 1
  }
}
