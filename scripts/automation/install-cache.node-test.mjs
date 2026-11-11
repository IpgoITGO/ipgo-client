import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const files = ['vercel-development.yml', 'vercel-production.yml']
const workflows = files.map((file) =>
  readFileSync(
    new URL(`../../.github/workflows/${file}`, import.meta.url),
    'utf8',
  ),
)

test('앱 캐시는 npm ci와 lockfile 검증·설치 스크립트·감사를 생략하지 않는다', () => {
  for (const workflow of workflows) {
    const installs = [...workflow.matchAll(/run: (npm ci[^\n]*)/g)]
    assert.ok(installs.length > 0)
    for (const [, command] of installs) {
      assert.match(command, /--prefer-offline/)
      assert.match(command, /--no-fund/)
      assert.doesNotMatch(command, /--(?:no-audit|ignore-scripts|offline\b)/)
    }
  }
  assert.match(
    workflows[0],
    /name: Run npm ci\s+run: npm ci --prefer-offline --no-fund/,
  )
})

test('CLI 캐시는 버전·런타임별 다운로드 데이터만 보관하고 매번 설치한다', () => {
  for (const workflow of workflows) {
    const section = workflow.slice(
      workflow.indexOf('      - name: Vercel CLI 다운로드 캐시'),
      workflow.indexOf('      - name: Vercel CLI 설치'),
    )
    assert.match(section, /uses: actions\/cache@[a-f0-9]{40}\b/)
    assert.match(
      section,
      /path: \$\{\{ runner.temp \}\}\/vercel-npm-cache\/_cacache/,
    )
    assert.match(section, /runner.os/)
    assert.match(section, /runner.arch/)
    assert.match(section, /steps.node.outputs.node-version/)
    assert.match(section, /env.VERCEL_CLI_VERSION/)
    assert.doesNotMatch(section, /restore-keys|node_modules|\.vercel\b|_logs/)
    assert.match(
      workflow,
      /- id: node\s+uses: actions\/setup-node@[a-f0-9]{40}/,
    )
    assert.match(
      workflow,
      /name: Vercel CLI 설치\s+run: npm install --global --no-fund --cache "\$RUNNER_TEMP\/vercel-npm-cache" "vercel@\$\{VERCEL_CLI_VERSION:\?[^\n]+\}"/,
    )
    assert.ok(
      workflow.indexOf('Vercel CLI 버전 확인') <
        workflow.indexOf('Vercel CLI 다운로드 캐시'),
    )
  }
})

test('CLI 버전 검사는 정확한 버전만 허용하며 범위·태그·빈 값을 거부한다', () => {
  for (const workflow of workflows) {
    const validation = workflow.match(
      /name: Vercel CLI 버전 확인\s+run: >-\s+node --input-type=module -e\s+'([^']+)'/,
    )
    assert.ok(validation)
    for (const version of [
      '1.2.3',
      '',
      'latest',
      '^1.2.3',
      '1.2',
      '1.2.3-beta.1',
    ]) {
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', validation[1]],
        {
          env: { VERCEL_CLI_VERSION: version },
          encoding: 'utf8',
        },
      )
      assert.equal(result.status, version === '1.2.3' ? 0 : 1)
    }
  }
})

test('CI 번들은 같은 job의 타입 검사 성공 뒤에만 실행하고 기본 빌드는 검사를 유지한다', () => {
  const pkg = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  )
  assert.match(pkg.scripts.build, /^tsc -b && vite build$/)
  assert.match(pkg.scripts['ci:check'], /(?:^| && )npm run typecheck(?: && |$)/)
  assert.equal(pkg.scripts['build:ci'], 'vite build')
  const verify = workflows[0].slice(
    workflows[0].indexOf('  verify:'),
    workflows[0].indexOf('  deploy:'),
  )
  assert.ok(
    verify.indexOf('run: npm run ci:check') <
      verify.indexOf('run: npm run build:ci'),
  )
  assert.match(
    verify,
    /run: npm run ci:check\s+if: github.event_name != 'workflow_dispatch' \|\| github.ref != 'refs\/heads\/dev'/,
  )
  assert.match(
    verify,
    /name: Build CI source outside a dev deployment\s+if: github.event_name != 'workflow_dispatch' \|\| github.ref != 'refs\/heads\/dev'\s+run: npm run build:ci/,
  )
  assert.doesNotMatch(verify, /continue-on-error:|always\(\)/)
  assert.match(workflows[0], /VITE_ENABLE_MSW=false npm run build/)
  assert.match(workflows[1], /run: npm run ci:check/)
  assert.match(workflows[1], /run: vercel build --prod/)
})
