import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const stages = [
  'format:check',
  'verification:test',
  'ci:check',
  'build',
  'verify:browser',
]
export const automationStages = [
  'lint',
  'format:check',
  'typecheck',
  'automation:test',
  'verification:test',
  'build:ci',
]
const root = fileURLToPath(new URL('../../', import.meta.url))

export function automationPlan({ changedPaths, beforePackage, afterPackage }) {
  if (
    !Array.isArray(changedPaths) ||
    !beforePackage ||
    !afterPackage ||
    changedPaths.some(
      (name) =>
        !['AGENTS.md', 'README.md', 'package.json'].includes(name) &&
        !/^(?:docs\/|scripts\/(?:automation|verification)\/|\.github\/workflows\/)/.test(
          name,
        ),
    )
  )
    throw new Error('AUTOMATION_SCOPE_REQUIRES_FULL_CHECKS')
  const { scripts: beforeScripts, ...before } = beforePackage
  const { scripts: afterScripts, ...after } = afterPackage
  const allowed = {
    'build:ci': 'vite build',
    'verify:automation':
      'node scripts/verification/verify-local.mjs --profile automation',
  }
  if (!beforeScripts || !afterScripts || !isDeepStrictEqual(before, after))
    throw new Error('DEPENDENCY_OR_PACKAGE_METADATA_CHANGED')
  for (const name of new Set([
    ...Object.keys(beforeScripts),
    ...Object.keys(afterScripts),
  ])) {
    if (
      beforeScripts[name] !== afterScripts[name] &&
      (!Object.hasOwn(allowed, name) || afterScripts[name] !== allowed[name])
    )
      throw new Error('CHECK_OR_BUILD_COMMAND_CHANGED')
  }
  if (afterScripts['build:ci'] !== allowed['build:ci'])
    throw new Error('CI_BUNDLE_COMMAND_REQUIRED')
  return [...automationStages]
}

export function currentImpact(
  git = (args) => execFileSync('git', args, { cwd: root }).toString(),
) {
  const baseSha = git(['merge-base', 'HEAD', 'origin/dev']).trim()
  if (!/^[a-f0-9]{40}$/.test(baseSha))
    throw new Error('AUTOMATION_BASE_REQUIRED')
  const changed = git(['diff', '--name-only', '-z', baseSha]).split('\0')
  const extra = git(['ls-files', '--others', '--exclude-standard', '-z']).split(
    '\0',
  )
  return {
    baseSha,
    changedPaths: [...new Set([...changed, ...extra])].filter(Boolean),
    beforePackage: JSON.parse(git(['show', `${baseSha}:package.json`])),
    afterPackage: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))),
  }
}

export function sourceFingerprint() {
  const paths = [
    'src',
    'scripts',
    '.github/workflows',
    'AGENTS.md',
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'tsconfig*.json',
    'eslint.config.js',
    'README.md',
    'docs',
  ]
  const tracked = execFileSync('git', ['ls-files', '-z', '--', ...paths], {
    cwd: root,
  })
    .toString()
    .split('\0')
  const extra = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z', '--', ...paths],
    { cwd: root },
  )
    .toString()
    .split('\0')
  const hash = crypto.createHash('sha256')
  hash.update(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }))
  for (const name of [...new Set([...tracked, ...extra])]
    .filter(Boolean)
    .sort()) {
    if (path.basename(name).startsWith('.env')) continue
    hash.update(name + '\0')
    hash.update(
      fs.existsSync(path.join(root, name))
        ? fs.readFileSync(path.join(root, name))
        : 'DELETED',
    )
  }
  return hash.digest('hex')
}

export async function runChecks({
  runStage,
  fingerprint,
  save,
  clock = () => Date.now(),
  profile = 'full',
  impact,
}) {
  if (!['full', 'automation'].includes(profile))
    throw new Error('UNKNOWN_CHECK_PROFILE')
  const selected =
    profile === 'automation' ? automationPlan(impact ?? {}) : stages
  const report = {
    started_at: new Date(clock()).toISOString(),
    provenance:
      profile === 'full'
        ? 'local_checks_and_synthetic_browser'
        : 'local_automation_checks',
    profile,
    full_pr_ci_required: true,
    omitted_local_checks:
      profile === 'automation' ? ['app_ui_tests', 'synthetic_browser'] : [],
    stages: [],
    passed: false,
    actual_savings: 'not_measured',
    deployment: false,
  }
  const before = fingerprint()
  report.source_fingerprint = before
  for (const name of selected) {
    const started = clock()
    report.stages.push({ name, status: 'running' })
    save(report)
    let code = 1
    try {
      code = await runStage(name)
    } catch {
      /* 실패 원문 대신 종료 상태만 기록한다. */
    }
    Object.assign(report.stages.at(-1), {
      status: code === 0 ? 'passed' : 'failed',
      exit_code: code,
      seconds: (clock() - started) / 1000,
    })
    save(report)
    if (code !== 0) break
  }
  report.source_unchanged = before === fingerprint()
  report.passed =
    report.stages.length === selected.length &&
    report.stages.every((s) => s.status === 'passed') &&
    report.source_unchanged
  report.finished_at = new Date(clock()).toISOString()
  report.seconds = (clock() - Date.parse(report.started_at)) / 1000
  save(report)
  return report
}

async function main() {
  process.umask(0o077)
  const npm = process.env.npm_execpath
  if (!npm) throw new Error('RUN_VIA_NPM')
  const args = process.argv.slice(2)
  if (
    args.length &&
    (args.length !== 2 || args[0] !== '--profile' || args[1] !== 'automation')
  )
    throw new Error('UNKNOWN_CHECK_PROFILE')
  const profile = args.length ? 'automation' : 'full'
  const impact = profile === 'automation' ? currentImpact() : undefined
  if (impact) automationPlan(impact)
  const outputRoot = fs.realpathSync(
    process.env.IPGO_VERIFY_OUTPUT_ROOT || os.tmpdir(),
  )
  const repoRoot = fs.realpathSync(root)
  if (outputRoot === repoRoot || outputRoot.startsWith(repoRoot + path.sep))
    throw new Error('OUTPUT_MUST_BE_OUTSIDE_REPO')
  const out = fs.mkdtempSync(path.join(outputRoot, 'ipgo-client-verify-'))
  fs.chmodSync(out, 0o700)
  const save = (report) =>
    fs.writeFileSync(
      path.join(out, 'summary.json'),
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    )
  const runStage = (name) =>
    new Promise((resolve) => {
      const fd = fs.openSync(
        path.join(out, name.replace(':', '-') + '.log'),
        'w',
        0o600,
      )
      const child = spawn(process.execPath, [npm, 'run', name], {
        cwd: root,
        env: { ...process.env, IPGO_VERIFY_OUTPUT: out },
        stdio: ['ignore', fd, fd],
      })
      let settled = false
      const done = (code) => {
        if (settled) return
        settled = true
        fs.closeSync(fd)
        resolve(code ?? 1)
      }
      child.once('error', () => done(1))
      child.once('exit', done)
    })
  const report = await runChecks({
    runStage,
    fingerprint: sourceFingerprint,
    save,
    profile,
    impact,
  })
  console.log(
    JSON.stringify({
      passed: report.passed,
      profile: report.profile,
      seconds: report.seconds,
      summary: path.join(out, 'summary.json'),
      stages: report.stages.map((s) => ({ name: s.name, status: s.status })),
    }),
  )
  if (!report.passed) process.exitCode = 1
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(() => {
    console.error('LOCAL_VERIFICATION_SETUP_FAILED')
    process.exitCode = 1
  })
}
