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

// 검산 제외 사유: 서버가 주는 문장에서 차이 개수만 뽑아 "꼬리표 · 차이 · 고칠 곳"으로 나눈다.
// 문장 모양이 달라 개수를 못 찾으면 원래 문장을 고칠 곳 자리에 그대로 보여준다.
export function describeExclusion(reason: string, date: string) {
  const gap = /(\d+)개 달라요/.exec(reason)
  if (!gap) return { label: '검산 안 맞음', summary: reason, fix: null }

  const [, month, day] = date.split('-').map(Number)
  return {
    label: '재고 안 맞음',
    summary: `재고 숫자가 ${gap[1]}개 안 맞아요`,
    fix: `수불부 ${month}월 ${day}일 행의 재고·입고·출고를 확인해 고쳐 주세요.`,
  }
}
