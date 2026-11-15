/** 오늘 + 리드타임(일) → "2026-11-21". 리드타임을 모르면 도착일 미정(null) */
export function arrivalOn(leadTime: number | null, now = new Date()) {
  if (leadTime == null) return null
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  day.setDate(day.getDate() + leadTime)
  return day.toLocaleDateString('sv')
}
