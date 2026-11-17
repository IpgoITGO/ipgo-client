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

// 시작 시각부터 지난 초. 1초마다 다시 읽는다(계산 중 진행 막대용).
export function useSeconds(since: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [since])
  return Math.max(0, Math.floor((now - since) / 1000))
}

// 95 -> "1분 35초", 20 -> "20초"
export function durationText(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}분 ${s}초` : `${s}초`
}
