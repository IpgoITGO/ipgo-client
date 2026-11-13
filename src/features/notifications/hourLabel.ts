// 받을 시각은 24시간(0~23시)으로만 쓴다(11/14 — 오전·오후를 섞으면 헷갈림)
export const hourLabel = (hour: number) => `${hour}시`

export const pad = (n: number) => String(n).padStart(2, '0')

// 적은 분을 10분 단위로 맞춘다(9:07 → 9:10, 9:56 → 10:00)
export const roundTo10 = (text: string) => {
  const [h, m] = text.split(':').map(Number)
  if (!Number.isInteger(h) || !Number.isInteger(m)) return text
  const total = (h * 60 + Math.round(m / 10) * 10) % (24 * 60)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

// "9:7"·"0907"·"21:30"·"21"을 [시, 분]으로. 시를 못 읽으면 [null, null], 분이 이상하면 0분
export function parseTime(raw: string): [number | null, number | null] {
  let hourText: string
  let minuteText: string
  if (raw.includes(':')) {
    ;[hourText = '', minuteText = ''] = raw.split(':')
  } else {
    const digits = raw.replace(/\D/g, '')
    hourText = digits.length > 2 ? digits.slice(0, -2) : digits
    minuteText = digits.length > 2 ? digits.slice(-2) : ''
  }
  const h = Number(hourText)
  if (hourText === '' || !Number.isInteger(h) || h < 0 || h > 23)
    return [null, null]
  const m = minuteText === '' ? 0 : Number(minuteText)
  if (!Number.isInteger(m) || m < 0 || m > 59) return [h, 0]
  return [h, m]
}
