import { useNavigate } from 'react-router-dom'

import { Button } from '../../shared/ui/Button/Button'
import { PagePlaceholder } from '../../shared/ui/PagePlaceholder/PagePlaceholder'

export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <PagePlaceholder
      description="주소가 바뀌었거나 없어진 페이지예요."
      kind="empty"
      title="찾는 페이지가 없어요"
    >
      <Button onClick={() => navigate('/')}>대시보드로 돌아가기</Button>
    </PagePlaceholder>
  )
}
