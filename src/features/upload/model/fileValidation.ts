export type UploadFileState = {
  file: File
  id: string
  period?: string
  reason?: string
  status: 'ready' | 'error'
}

const filenamePattern = /^(\d{4})-(0[1-9]|1[0-2])\.xlsx$/i

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

  const match = filenamePattern.exec(file.name)
  if (!match) {
    return {
      file,
      id,
      reason: '파일명에서 연·월을 찾을 수 없어요.',
      status: 'error',
    }
  }

  return {
    file,
    id,
    period: `${match[1]}년 ${Number(match[2])}월`,
    status: 'ready',
  }
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
