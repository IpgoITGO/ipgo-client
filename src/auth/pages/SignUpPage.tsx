import { Link } from 'react-router-dom'

import { PagePlaceholder } from '../../shared/ui/PagePlaceholder/PagePlaceholder'

export function SignUpPage() {
  return (
    <PagePlaceholder
      description="회원가입 화면은 별도 화면 구현 Issue에서 추가합니다."
      title="회원가입"
    >
      <Link to="/login">로그인으로 돌아가기</Link>
    </PagePlaceholder>
  )
}
