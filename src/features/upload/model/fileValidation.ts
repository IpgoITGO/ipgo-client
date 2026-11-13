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

const filenamePattern =
  /^(\d{4})-(0[1-9]|1[0-2])(?:[ _-](?:\d+|\(\d+\)))?\.xlsx$/i

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

  // 파일 이름은 자유(11/13 팀 결정). 이름이 2026-09처럼 연-월이면 미리 기간을 알려 주고,
  // 아니면 서버가 F열 입고일자의 가장 늦은 날로 기간을 정한다.
  const match = filenamePattern.exec(file.name)
  if (!match) {
    return { file, id, status: 'ready' }
  }

  return {
    file,
    id,
    periodKey: `${match[1]}-${match[2]}`,
    period: `${match[1]}년 ${Number(match[2])}월`,
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
