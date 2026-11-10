import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const stages = [
  'format:check',
  'verification:test',
  'ci:check',
  'build',
  'verify:browser',
]
const root = fileURLToPath(new URL('../../', import.meta.url))

export function sourceFingerprint() {
  const paths = [
    'src',
    'scripts',
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'tsconfig*.json',
    'eslint.config.js',
    'README.md',
    'docs/rules/workflow.md',
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
}) {
  const report = {
    started_at: new Date(clock()).toISOString(),
    provenance: 'local_checks_and_synthetic_browser',
    stages: [],
    passed: false,
    actual_savings: 'not_measured',
    deployment: false,
  }
  const before = fingerprint()
  for (const name of stages) {
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
    report.stages.length === stages.length &&
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
  })
  console.log(
    JSON.stringify({
      passed: report.passed,
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
