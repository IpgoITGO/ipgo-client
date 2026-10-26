import { useParams } from 'react-router-dom'

import { PagePlaceholder } from '../../../shared/ui/PagePlaceholder/PagePlaceholder'

export function SkuPage() {
  const { skuId } = useParams()

  return (
    <PagePlaceholder
      description={`SKU ${skuId ?? ''} 상세 화면은 별도 기능 Issue에서 구현합니다.`}
      title="SKU 상세"
    />
  )
}
