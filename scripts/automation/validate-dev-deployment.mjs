import { pathToFileURL } from 'node:url'

export function validateDeployment(env) {
  if (
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REF !== 'refs/heads/dev'
  ) {
    throw new Error('개발 배포는 dev의 승인된 수동 실행만 허용합니다.')
  }
  if (
    !/^[a-f0-9]{40}$/.test(env.EXPECTED_SHA ?? '') ||
    env.EXPECTED_SHA !== env.GITHUB_SHA
  ) {
    throw new Error(
      '승인 SHA가 실행 commit과 다릅니다. 새 승인안이 필요합니다.',
    )
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  validateDeployment(process.env)
}
