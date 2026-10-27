import { useParams } from 'react-router-dom'

import { PagePlaceholder } from '../../../shared/ui/PagePlaceholder/PagePlaceholder'

export function UploadResultPage() {
  const { uploadId } = useParams()

  return (
    <PagePlaceholder
      description={`업로드 ${uploadId ?? ''}의 분석 결과 화면은 별도 기능 Issue에서 구현합니다.`}
      title="업로드 결과"
    />
  )
}
