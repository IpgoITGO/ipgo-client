import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function prepareBuildConfig(config, target) {
  if (!['preview', 'production'].includes(target)) {
    throw new Error('Preview 또는 Production 빌드 대상이 필요합니다.')
  }
  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    config.builds
  ) {
    throw new Error('지원하지 않는 Vercel 빌드 설정입니다.')
  }
  return {
    ...config,
    installCommand: 'npm ci --prefer-offline --no-fund',
    buildCommand:
      target === 'production'
        ? 'npm run ci:check && npm run build:ci'
        : 'VITE_ENABLE_MSW=false npm run build',
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const file = new URL('../../vercel.json', import.meta.url)
  const config = prepareBuildConfig(
    JSON.parse(readFileSync(file, 'utf8')),
    process.argv[2],
  )
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n')
}
