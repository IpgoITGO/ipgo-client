// 0~23시를 "오전 9시"·"오후 3시"로
export const hourLabel = (hour: number) =>
  `${hour < 12 ? '오전' : '오후'} ${hour % 12 === 0 ? 12 : hour % 12}시`

export const pad = (n: number) => String(n).padStart(2, '0')

// 적은 분을 10분 단위로 맞춘다(9:07 → 9:10, 9:56 → 10:00)
export const roundTo10 = (text: string) => {
  const [h, m] = text.split(':').map(Number)
  if (!Number.isInteger(h) || !Number.isInteger(m)) return text
  const total = (h * 60 + Math.round(m / 10) * 10) % (24 * 60)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}
