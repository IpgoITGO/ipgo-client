export type UploadFileState = {
  existingUpload?: {
    originalName?: string
    uploadedAt: string
  }
  file: File
  id: string
  overwrite?: boolean
  periodKey?: string
  period?: string
  reason?: string
  // sameFile: 내용이 똑같은 파일을 다른 기간 이름으로 이미 올림. 덮어쓸 수 없다.
  status: 'ready' | 'duplicate' | 'sameFile' | 'error'
}

// ipgo-server UploadPeriod: 숫자 표기를 먼저 모으고 한글 표기를 모은다.
const filenamePatterns = [
  /(?<!\d)(20\d{2})[-_. ]?(0[1-9]|1[0-2])(?!\d)/g,
  /(?<!\d)(20\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월/g,
]

export function validateUploadFile(file: File): UploadFileState {
  const id = `${file.name}-${file.size}-${file.lastModified}`

  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return {
      file,
      id,
      reason: 'XLSX 파일만 올릴 수 있어요.',
      status: 'error',
    }
  }

  const base = file.name.replace(/\.xlsx$/i, '')
  const periods = new Set(
    filenamePatterns.flatMap((pattern) =>
      Array.from(
        base.matchAll(pattern),
        (match) => `${match[1]}-${match[2].padStart(2, '0')}`,
      ),
    ),
  )
  if (periods.size > 1) {
    return {
      file,
      id,
      reason: '파일명에 연·월이 여러 개 있어요. 한 달씩 올려주세요.',
      status: 'error',
    }
  }
  const periodKey = [...periods][0]
  if (!periodKey) return { file, id, status: 'ready' }
  const [year, month] = periodKey.split('-')
  return {
    file,
    id,
    periodKey,
    period: `${year}년 ${Number(month)}월`,
    status: 'ready',
  }
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// "2026년 11월" 목록 → 몇 개월인지 + 어느 달인지(3개까지는 그대로, 넘으면 "처음 ~ 끝")
export function replacedLabel(periods: string[]) {
  const order = (period: string) => {
    const [year = 0, month = 0] = (period.match(/\d+/g) ?? []).map(Number)
    return year * 100 + month
  }
  const sorted = [...new Set(periods)].sort((a, b) => order(a) - order(b))
  return {
    count: sorted.length,
    months:
      sorted.length <= 3
        ? sorted.join(', ')
        : `${sorted[0]} ~ ${sorted.at(-1)}`,
  }
}
