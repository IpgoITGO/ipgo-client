const value = process.env.DEPLOYMENT_URL
const url = new URL(value)

if (
  url.protocol !== 'https:' ||
  url.origin !== value ||
  !url.hostname.endsWith('.vercel.app')
) {
  throw new Error('Vercel 배포 URL 형식이 올바르지 않습니다.')
}

console.log(`검증된 Vercel 배포 주소: ${url.hostname}`)
