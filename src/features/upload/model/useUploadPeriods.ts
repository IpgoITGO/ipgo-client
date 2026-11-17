import { useQuery } from '@tanstack/react-query'

import { getUploadPeriods } from './uploadApi'

export function useUploadPeriods() {
  return useQuery({
    queryKey: ['upload-periods'],
    queryFn: getUploadPeriods,
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === 'PROCESSING')
        ? 3000
        : false,
  })
}
