import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  // API_PROXY_TARGET이 있으면 개발 서버가 /api 요청을 그 서버로 넘깁니다. (브라우저에는 노출되지 않음)
  const { API_PROXY_TARGET } = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: API_PROXY_TARGET
        ? { '/api': { target: API_PROXY_TARGET, changeOrigin: true } }
        : undefined,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
    },
  }
})
