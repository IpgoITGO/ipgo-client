import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { prepareBuildConfig } from './prepare-vercel-build.mjs'

test('설치는 npm ci 한 번이며 스크립트·감사를 생략하지 않고 라우팅을 유지한다', () => {
  const original = {
    rewrites: [
      {
        source: '/api/:path*',
        destination: 'https://example.invalid/api/:path*',
      },
    ],
    git: { deploymentEnabled: false },
  }
  for (const target of ['preview', 'production']) {
    const result = prepareBuildConfig(original, target)
    assert.equal(result.installCommand, 'npm ci --prefer-offline --no-fund')
    assert.equal(result.rewrites, original.rewrites)
    assert.equal(result.git, original.git)
    assert.equal(original.installCommand, undefined)
  }
  for (const target of ['', 'dev', undefined])
    assert.throws(() => prepareBuildConfig(original, target))
  assert.throws(() => prepareBuildConfig({ builds: [] }, 'preview'))
})

test('두 배포 job에는 외부 앱 설치가 없고 운영 전체 검사는 Vercel 빌드 전에 차단한다', () => {
  for (const [file, target] of [
    ['vercel-development.yml', 'preview'],
    ['vercel-production.yml', 'production'],
  ]) {
    const workflow = readFileSync(
      new URL(`../../.github/workflows/${file}`, import.meta.url),
      'utf8',
    )
    const deploy = file.includes('development')
      ? workflow.slice(workflow.indexOf('  deploy:'))
      : workflow
    assert.doesNotMatch(deploy, /run: npm ci/)
    assert.ok(
      deploy.indexOf(`prepare-vercel-build.mjs ${target}`) <
        deploy.indexOf('vercel build'),
    )
    assert.ok(
      deploy.indexOf('vercel build') <
        deploy.indexOf('vercel deploy --prebuilt'),
    )
    assert.doesNotMatch(deploy, /continue-on-error:|always\(\)/)
  }
})

test('운영 검사 실패는 앱 빌드를 실행하지 않고 성공하면 검사 후 빌드한다', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ipgo-build-gate-'))
  try {
    for (const fail of [true, false]) {
      writeFileSync(
        path.join(directory, 'package.json'),
        JSON.stringify({
          scripts: {
            'ci:check': `node -e "require('fs').writeFileSync('checked', 'yes');process.exit(${fail ? 1 : 0})"`,
            build: 'node -e "process.exit(99)"',
            'build:ci':
              "node -e \"require('fs').writeFileSync('built', require('fs').readFileSync('checked'))\"",
          },
        }),
      )
      const result = spawnSync(
        '/bin/sh',
        ['-c', prepareBuildConfig({}, 'production').buildCommand],
        { cwd: directory, encoding: 'utf8' },
      )
      assert.equal(result.status, fail ? 1 : 0, result.stderr)
      if (fail) assert.throws(() => readFileSync(path.join(directory, 'built')))
      else
        assert.equal(readFileSync(path.join(directory, 'built'), 'utf8'), 'yes')
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
