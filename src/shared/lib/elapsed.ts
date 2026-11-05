import { useEffect, useState } from 'react'

// "2026. 11. 4" -> "11/4"
export function shortDate(date: string) {
  const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(date)
  return m ? `${Number(m[2])}/${Number(m[3])}` : date
}

// 시작 시각부터 N분째(1분째부터). 30초마다 다시 읽는다.
export function useMinutes(since?: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === undefined) return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [since])
  if (since === undefined) return 0
  return Math.max(1, Math.floor((now - since) / 60_000) + 1)
}
