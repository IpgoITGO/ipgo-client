import {
  type ChangeEvent,
  type DragEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'

import { apiRequest } from '../../../shared/api/client'
import { useActionLock } from '../../../shared/hooks/useActionLock'
import { Button } from '../../../shared/ui/Button/Button'
import { Modal } from '../../../shared/ui/Modal/Modal'
import {
  formatFileSize,
  type UploadFileState,
  validateUploadFile,
} from '../model/fileValidation'
import styles from './UploadPage.module.css'

export function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const [files, setFiles] = useState<UploadFileState[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeModal, setActiveModal] = useState<{
    id: string
    type: 'duplicate' | 'error'
  } | null>(null)

  const readyFiles = useMemo(
    () => files.filter((item) => item.status === 'ready'),
    [files],
  )

  function addFiles(selectedFiles: FileList | File[]) {
    const nextFiles = Array.from(selectedFiles).map((file) => {
      const item = validateUploadFile(file)
      if (item.periodKey === '2026-09') {
        return {
          ...item,
          existingUpload: { uploadedAt: '2026.10.15 오전 10:02' },
          status: 'duplicate' as const,
        }
      }
      return item
    })
    setFiles((current) => {
      const ids = new Set(current.map((item) => item.id))
      return [...current, ...nextFiles.filter((item) => !ids.has(item.id))]
    })
    const firstAttention = nextFiles.find((item) => item.status !== 'ready')
    if (firstAttention) {
      setActiveModal({
        id: firstAttention.id,
        type: firstAttention.status === 'duplicate' ? 'duplicate' : 'error',
      })
    }
    setError(null)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files)
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    addFiles(event.dataTransfer.files)
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((item) => item.id !== id))
    setActiveModal(null)
  }

  function confirmOverwrite(id: string) {
    setFiles((current) =>
      current.map((item) =>
        item.id === id ? { ...item, overwrite: true, status: 'ready' } : item,
      ),
    )
    setActiveModal(null)
  }

  const uploadAction = useActionLock(async () => {
    if (readyFiles.length === 0) return

    const formData = new FormData()
    readyFiles.forEach((item) => formData.append('files', item.file))

    try {
      const result = await apiRequest<{ uploadId: string }>('/uploads', {
        body: formData,
        method: 'POST',
      })
      navigate(`/upload/${result.uploadId}/result`)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '파일을 올리지 못했어요. 다시 시도해 주세요.',
      )
    }
  })

  const modalFile = files.find((item) => item.id === activeModal?.id)

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <button className={styles.back} onClick={() => navigate('/dashboard')}>
          ← 대시보드로
        </button>
        <h1>올릴 수불부를 확인해 주세요</h1>
        <p>월별 XLSX 파일을 여러 개 한 번에 선택할 수 있어요.</p>
      </header>

      <div
        className={styles.dropzone}
        data-dragging={isDragging}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span aria-hidden="true" className={styles.uploadIcon}>
          ↑
        </span>
        <strong>파일을 끌어 놓거나 직접 골라 주세요</strong>
        <span>XLSX · 파일명 예시 2026-09.xlsx · 여러 파일 가능</span>
        <Button onClick={() => inputRef.current?.click()} variant="secondary">
          파일 고르기
        </Button>
        <input
          ref={inputRef}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="수불부 파일 선택"
          className={styles.fileInput}
          multiple
          onChange={handleChange}
          type="file"
        />
      </div>

      {files.length > 0 && (
        <section className={styles.fileSection}>
          <div className={styles.sectionHeader}>
            <h2>고른 파일</h2>
            <span>{files.length}개</span>
          </div>
          <ul className={styles.fileList}>
            {files.map((item) => (
              <li className={styles.fileRow} key={item.id}>
                <div className={styles.fileName}>
                  <strong>{item.file.name}</strong>
                  <span>
                    {item.period ?? '기간 확인 필요'} ·{' '}
                    {formatFileSize(item.file.size)}
                  </span>
                </div>
                <span className={styles.status} data-status={item.status}>
                  {item.status === 'ready'
                    ? item.overwrite
                      ? '덮어쓰기 확인'
                      : '올릴 수 있어요'
                    : item.status === 'duplicate'
                      ? '이미 올린 기간 · 확인 필요'
                      : '형식 오류'}
                </span>
                {item.status !== 'ready' && (
                  <button
                    className={styles.detail}
                    onClick={() =>
                      setActiveModal({
                        id: item.id,
                        type:
                          item.status === 'duplicate' ? 'duplicate' : 'error',
                      })
                    }
                  >
                    {item.status === 'duplicate' ? '확인하기' : '이유 보기'}
                  </button>
                )}
                <button
                  aria-label={`${item.file.name} 제거`}
                  className={styles.remove}
                  onClick={() => removeFile(item.id)}
                >
                  제거
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <footer className={styles.actions}>
        <div>
          <strong>고른 파일 {files.length}개</strong>
          <span>올릴 수 있는 파일 {readyFiles.length}개</span>
        </div>
        <Button onClick={() => navigate('/dashboard')} variant="secondary">
          취소
        </Button>
        <Button
          disabled={readyFiles.length === 0}
          loading={uploadAction.isPending}
          loadingLabel="올리는 중"
          onClick={() => void uploadAction.run()}
        >
          {readyFiles.length}개 올리기
        </Button>
      </footer>

      {activeModal && modalFile && (
        <Modal
          labelledBy="upload-modal-title"
          onClose={() => setActiveModal(null)}
        >
          {activeModal.type === 'duplicate' ? (
            <div className={styles.modalContent}>
              <span aria-hidden="true" className={styles.modalIcon}>
                ↻
              </span>
              <h2 id="upload-modal-title">이미 올린 기간이에요</h2>
              <p>
                덮어쓰면 이 기간 자료를 새 파일로 바꾸고 다시 계산해요. 이전
                결과는 이력으로 남아요.
              </p>
              <div className={styles.modalFile}>
                <strong>{modalFile.file.name}</strong>
                <span>
                  {modalFile.period} · {modalFile.existingUpload?.uploadedAt}에
                  올림
                </span>
              </div>
              <div className={styles.modalActions}>
                <Button
                  onClick={() => setActiveModal(null)}
                  variant="secondary"
                >
                  취소
                </Button>
                <Button onClick={() => confirmOverwrite(modalFile.id)}>
                  덮어쓰기
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.modalContent}>
              <span aria-hidden="true" className={styles.modalIcon}>
                !
              </span>
              <h2 id="upload-modal-title">이 파일은 올릴 수 없어요</h2>
              <p>
                다른 파일은 그대로 두고, 아래 내용을 고친 뒤 다시 골라 주세요.
              </p>
              <div className={styles.modalFile}>
                <strong>{modalFile.file.name}</strong>
                <span>{modalFile.reason}</span>
              </div>
              <div className={styles.modalActions}>
                <Button
                  onClick={() => removeFile(modalFile.id)}
                  variant="secondary"
                >
                  이 파일 빼기
                </Button>
                <Button
                  onClick={() => {
                    removeFile(modalFile.id)
                    inputRef.current?.click()
                  }}
                >
                  다시 고르기
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
