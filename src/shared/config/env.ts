import { z } from 'zod'

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default('/api'),
  VITE_ENABLE_MSW: z.enum(['true', 'false']).default('false'),
})

const result = envSchema.safeParse(import.meta.env)

if (!result.success) {
  const invalidNames = result.error.issues
    .map((issue) => issue.path.join('.'))
    .filter(Boolean)
    .join(', ')

  throw new Error(`환경 변수 구성이 올바르지 않습니다: ${invalidNames}`)
}

export const env = Object.freeze({
  apiBaseUrl: result.data.VITE_API_BASE_URL,
  enableMsw: result.data.VITE_ENABLE_MSW === 'true',
})
