// 서버가 주는 날짜(YYYY-MM-DD)와 일시(ISO 8601)를 화면 글자로 바꾼다.

export function formatDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return `${year}. ${month}. ${day}`
}

export function formatPeriod(start: string, end: string) {
  return `${formatDate(start)} ~ ${formatDate(end)}`
}

// 한국 시간 기준 "2026.10.15 오전 10:02"
export function formatUploadedAt(iso: string) {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  const hour = kst.getUTCHours()
  const minute = String(kst.getUTCMinutes()).padStart(2, '0')
  const dayPeriod = hour < 12 ? '오전' : '오후'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12

  return `${kst.getUTCFullYear()}.${kst.getUTCMonth() + 1}.${kst.getUTCDate()} ${dayPeriod} ${hour12}:${minute}`
}
