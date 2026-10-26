import { Link } from 'react-router-dom'

import { PagePlaceholder } from '../../shared/ui/PagePlaceholder/PagePlaceholder'

export function NotFoundPage() {
  return (
    <PagePlaceholder
      description="요청한 주소를 찾을 수 없어요."
      title="페이지가 없습니다"
    >
      <Link to="/">처음으로 돌아가기</Link>
    </PagePlaceholder>
  )
}
