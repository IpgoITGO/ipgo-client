import { QueryClientProvider } from '@tanstack/react-query'
import { type PropsWithChildren, useEffect, useState } from 'react'

import { AuthProvider } from '../../auth/model/AuthProvider'
import { useAuth } from '../../auth/model/useAuth'
import { CalculationProvider } from '../../shared/api/CalculationProvider'
import { clearTrackedRun } from '../../shared/api/calculationStorage'
import { createQueryClient } from '../../shared/api/queryClient'

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CalculationScope>{children}</CalculationScope>
      </AuthProvider>
    </QueryClientProvider>
  )
}

function CalculationScope({ children }: PropsWithChildren) {
  const { user, status } = useAuth()
  useEffect(() => {
    if (status === 'anonymous') clearTrackedRun()
  }, [status])
  // 로그아웃·계정 전환 시 다른 사용자의 계산 추적을 남기지 않는다.
  return (
    <CalculationProvider
      key={user?.email ?? 'anonymous'}
      storageScope={user?.email}
    >
      {children}
    </CalculationProvider>
  )
}
