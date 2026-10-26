import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

import { PagePlaceholder } from '../../shared/ui/PagePlaceholder/PagePlaceholder'

export function RouteErrorPage() {
  const error = useRouteError()
  const description = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : '페이지를 불러오는 중 문제가 생겼어요.'

  return (
    <PagePlaceholder description={description} title="오류가 발생했습니다" />
  )
}
