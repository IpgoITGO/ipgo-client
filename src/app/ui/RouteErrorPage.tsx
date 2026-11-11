import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

import { Button } from '../../shared/ui/Button/Button'
import { PagePlaceholder } from '../../shared/ui/PagePlaceholder/PagePlaceholder'

export function RouteErrorPage() {
  const error = useRouteError()
  // 상태 번호는 작게 함께 둔다(알려 줄 때 쓰게), 문장은 우리 말로
  const code = isRouteErrorResponse(error) ? ` (${error.status})` : ''

  return (
    <PagePlaceholder
      description={`다시 시도해도 같으면 잠시 뒤 다시 와 주세요.${code}`}
      kind="error"
      title="잠깐 문제가 생겼어요"
    >
      <Button onClick={() => window.location.reload()}>다시 시도</Button>
      <Button onClick={() => window.location.assign('/')} variant="secondary">
        대시보드로
      </Button>
    </PagePlaceholder>
  )
}
