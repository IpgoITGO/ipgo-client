import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'

import { ApiError, errorText } from '../../../shared/api/client'
import { useCalculation } from '../../../shared/api/calculationContext'
import { useActionLock } from '../../../shared/hooks/useActionLock'
import { Button } from '../../../shared/ui/Button/Button'
import { LockedButton } from '../../billing/components/LockedButton'
import { useCalcLock } from '../../billing/model/useCalcLock'
import { Modal } from '../../../shared/ui/Modal/Modal'
import {
  formatFileSize,
  type UploadFileState,
  validateUploadFile,
} from '../model/fileValidation'
import { type UploadPeriods, uploadFile } from '../model/uploadApi'
import { useUploadPeriods } from '../model/useUploadPeriods'
import { UploadHistory } from '../components/UploadHistory'
import { formatUploadedAt, monthLabel } from '../model/uploadFormat'
import boxOpen from '../../billing/assets/box-open.webp'
import styles from './UploadPage.module.css'

// 이미 올린 기간(U3)과 겹치는 파일은 덮어쓰기 확인이 필요한 상태로 바꾼다.
function markDuplicate(
  item: UploadFileState,
  periods: UploadPeriods | undefined,
): UploadFileState {
  const existing = periods?.items.find(
    (period) => period.period === item.periodKey,
  )
  if (!existing || item.status !== 'ready' || item.overwrite) return item

  return {
    ...item,
    existingUpload: { uploadedAt: formatUploadedAt(existing.uploadedAt) },
    status: 'duplicate',
  }
}

// 409 기간은 파일명 추측보다 서버가 실제 읽은 입고일자를 우선한다.
function serverDuplicate(
  item: UploadFileState,
  cause: ApiError,
): UploadFileState | null {
  const existing = cause.details?.existing
  if (!existing || typeof existing !== 'object') return null
  const record = existing as Record<string, unknown>
  const start = record.periodStart ?? record.period
  if (
    typeof start !== 'string' ||
    !/^20\d{2}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(start)
  )
    return null
  const periodKey = start.slice(0, 7)
  return {
    ...item,
    periodKey,
    period: monthLabel(periodKey),
    inferredPeriod: !item.periodKey,
    overwrite: false,
    status: 'duplicate',
    existingUpload: {
      originalName:
        typeof record.originalName === 'string'
          ? record.originalName
          : undefined,
      uploadedAt:
        typeof record.uploadedAt === 'string' &&
        Number.isFinite(Date.parse(record.uploadedAt))
          ? formatUploadedAt(record.uploadedAt)
          : '',
    },
  }
}

type FailedUpload = { id: string; name: string; reason: string }
type BatchOutcome = {
  uploadStartedAt: number
  uploadIds: number[]
  replaced: string[]
  failedUploads: FailedUpload[]
}

// ipgo-server UploadException 중 "이 파일 때문"인 것: 형식이 틀림(400)·너무 큼(413)
const SERVER_REJECTED = new Set(['UPLOAD_INVALID_FORMAT', 'FILE_TOO_LARGE'])

export function UploadPage() {
  const { busy: calculationBusy, dismiss } = useCalculation()
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const retryPeriod = params.get('retry')
  const location = useLocation()
  const retryRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!retryPeriod) return
    retryRef.current?.scrollIntoView?.({ block: 'start' })
    retryRef.current?.querySelector('button')?.focus({ preventScroll: true })
  }, [retryPeriod, location.key])
  const lock = useCalcLock()
  const [files, setFiles] = useState<UploadFileState[]>([])
  // 형식이 틀린 파일은 목록에 넣지 않고 이유 팝업으로만 알린다.
  const [rejected, setRejected] = useState<UploadFileState[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 확인이 필요한 파일을 차례로 하나씩 팝업으로 보여 준다. 맨 앞이 지금 열린 팝업이다.
  const [modalQueue, setModalQueue] = useState<string[]>([])

  const queryClient = useQueryClient()
  const periods = useUploadPeriods()
  const uploadStartedAt = useRef<number | null>(null)
  const [acceptedIds, setAcceptedIds] = useState<number[]>([])
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([])
  const [pendingOutcome, setPendingOutcome] = useState<BatchOutcome | null>(
    null,
  )

  const readyFiles = useMemo(
    () => files.filter((item) => item.status === 'ready'),
    [files],
  )

  // 확인창에서 취소하거나 제외한 파일도 결과 요약에 남긴다. 덮어쓰기를 고르면 준비 파일로 남아 전송을 기다린다.
  useEffect(() => {
    if (!pendingOutcome || modalQueue.length > 0 || readyFiles.length > 0)
      return
    const ids = pendingOutcome.uploadIds
    navigate(`/upload/${ids.at(-1)}/result?uploads=${ids.join(',')}`, {
      state: pendingOutcome,
    })
  }, [pendingOutcome, modalQueue.length, readyFiles.length, navigate])

  async function addFiles(selectedFiles: FileList | File[]) {
    // 파일 칸을 비우면 브라우저가 같은 FileList를 비워 버리니, 기다리기 전에 배열로 옮겨 둔다.
    const picked = Array.from(selectedFiles)
    // 고를 때마다 서버 목록을 새로 받아 비교한다. 저장해 둔 목록(30초)은 방금 올린 기간이나
    // 다른 창에서 올린 기간을 모를 수 있다(11/2: 올린 직후 같은 파일을 다시 골라도 팝업이 안 떴음).
    const uploaded = (await periods.refetch()).data ?? periods.data
    const selectedPeriods = new Set(
      files.map((item) => item.periodKey).filter(Boolean),
    )
    const nextFiles = picked.map((file) => {
      const item = validateUploadFile(file)
      if (item.periodKey && selectedPeriods.has(item.periodKey)) {
        return {
          ...item,
          status: 'error' as const,
          reason: `${item.period} 파일을 이미 골랐어요. 같은 달은 한 개씩 골라 주세요.`,
        }
      }
      if (item.periodKey) selectedPeriods.add(item.periodKey)
      return markDuplicate(item, uploaded)
    })
    const ids = new Set(files.map((item) => item.id))
    const added = nextFiles.filter((item) => !ids.has(item.id))
    setFiles((current) => [
      ...current,
      ...added.filter((item) => item.status !== 'error'),
    ])
    setRejected(added.filter((item) => item.status === 'error'))
    setModalQueue((current) => [
      ...current,
      ...added.filter((item) => item.status !== 'ready').map((item) => item.id),
    ])
    setError(null)
  }

  function closeModal() {
    setModalQueue((current) => current.slice(1))
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void addFiles(event.target.files)
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    void addFiles(event.dataTransfer.files)
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((item) => item.id !== id))
    setModalQueue((current) => current.filter((item) => item !== id))
  }

  function confirmOverwrite(id: string) {
    setFiles((current) =>
      current.map((item) =>
        item.id === id ? { ...item, overwrite: true, status: 'ready' } : item,
      ),
    )
    closeModal()
  }

  const uploadAction = useActionLock(async () => {
    if (readyFiles.length === 0 || calculationBusy) return
    dismiss()
    uploadStartedAt.current ??= Date.now()

    setPendingOutcome(null)
    setError(null)
    const uploadIds = [...acceptedIds]
    const replaced: string[] = []
    const failures = new Map(failedUploads.map((item) => [item.id, item]))
    const modalIds: string[] = []
    let retryRequired = false
    for (const item of files) {
      if (item.status === 'duplicate' || item.status === 'sameFile')
        failures.set(item.id, {
          id: item.id,
          name: item.file.name,
          reason:
            item.status === 'duplicate'
              ? '이미 올린 달이에요. 덮어쓰기를 확인해 주세요.'
              : '같은 내용의 파일을 이미 올렸어요.',
        })
    }
    for (const item of readyFiles) {
      try {
        const result = await uploadFile(item.file, Boolean(item.overwrite))
        uploadIds.push(result.uploadId)
        failures.delete(item.id)
        setAcceptedIds([...uploadIds])
        if (item.overwrite && item.period) replaced.push(item.period)
        setFiles((current) => current.filter((file) => file.id !== item.id))
      } catch (cause) {
        const duplicate =
          cause instanceof ApiError && cause.code === 'UPLOAD_DUPLICATE'
        let updated: UploadFileState | null = null
        let reason: string
        if (duplicate && cause.details?.reason === 'SAME_FILE') {
          const existing = cause.details.existing as
            { originalName?: string; uploadedAt?: string } | undefined
          updated = {
            ...item,
            overwrite: false,
            status: 'sameFile',
            existingUpload: {
              originalName: existing?.originalName,
              uploadedAt: existing?.uploadedAt
                ? formatUploadedAt(existing.uploadedAt)
                : '',
            },
          }
          reason = '같은 내용의 파일을 이미 올렸어요.'
        } else if (duplicate) {
          updated = serverDuplicate(item, cause)
          if (!updated) {
            const latest = await periods.refetch()
            const marked = markDuplicate(
              { ...item, overwrite: false },
              latest.data,
            )
            if (marked.status === 'duplicate') updated = marked
          }
          reason = updated
            ? '이미 올린 달이에요. 덮어쓰기를 확인해 주세요.'
            : '기간을 확인하지 못했어요. 업로드 내역을 확인한 뒤 다시 골라 주세요.'
        } else reason = errorText(cause)
        failures.set(item.id, { id: item.id, name: item.file.name, reason })
        if (updated) {
          const replacement = updated
          setFiles((current) =>
            current.map((file) => (file.id === item.id ? replacement : file)),
          )
          modalIds.push(item.id)
        } else if (
          cause instanceof ApiError &&
          SERVER_REJECTED.has(cause.code)
        ) {
          setFiles((current) => current.filter((file) => file.id !== item.id))
          setRejected((current) => [
            ...current,
            { ...item, reason, status: 'error' },
          ])
          modalIds.push(item.id)
        } else {
          // 접속·인증 오류는 같은 요청을 무작정 이어 보내지 않고 남은 파일의 수동 재시도를 기다린다.
          retryRequired = true
          setError(
            uploadIds.length > 0
              ? `${uploadIds.length}개는 올렸어요. 남은 파일: ${reason}`
              : reason,
          )
          break
        }
      }
    }
    void queryClient.invalidateQueries({ queryKey: ['upload-periods'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    const failureList = [...failures.values()]
    setFailedUploads(failureList)
    const outcome = {
      uploadIds,
      replaced,
      failedUploads: failureList,
      uploadStartedAt: uploadStartedAt.current,
    }
    if (modalIds.length > 0) {
      setModalQueue(modalIds)
      if (uploadIds.length > 0 && !retryRequired) setPendingOutcome(outcome)
    } else if (uploadIds.length > 0 && !retryRequired) {
      const search =
        uploadIds.length > 1 || failureList.length > 0
          ? `?uploads=${uploadIds.join(',')}`
          : ''
      navigate(`/upload/${uploadIds.at(-1)}/result${search}`, {
        state: outcome,
      })
    }
  })

  const modalFile = [...files, ...rejected].find(
    (item) => item.id === modalQueue[0],
  )

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <Link className={styles.back} to="/dashboard">
          ← 대시보드로
        </Link>
        {/* 오른쪽 위 예시 파일(11/13): 처음 올리는 셀러가 칸 모양을 보고 맞출 수 있게 */}
        <div className={styles.introRow}>
          <h1>올릴 수불부를 확인해 주세요</h1>
          <a
            className={styles.sample}
            download="수불부 예시.xlsx"
            href="/samples/ledger-sample.xlsx"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            예시 파일 받기
          </a>
        </div>
        <p>
          XLSX 파일을 여러 개 한 번에 선택할 수 있어요. 파일 이름은 자유예요.
        </p>
      </header>

      <div ref={retryRef} className={styles.retryTarget}>
        {retryPeriod && (
          <p role="status">
            {monthLabel(retryPeriod)} 파일을 골라 다시 올려 주세요. 다른 달은
            다시 올리지 않아도 돼요.
          </p>
        )}
        <div
          className={styles.dropzone}
          data-dragging={isDragging}
          onDragEnter={() => setIsDragging(true)}
          // 안쪽 그림·글자 위로 옮겨 갈 땐 끝난 게 아니다(깜빡임 방지): 상자 밖으로 나갈 때만 끈다
          onDragLeave={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              setIsDragging(false)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          {/* 열린 ITGO 상자(11/11): 마우스를 올리거나 파일을 끌어 오면 커진 채로 있다가 빼면 원래 크기 */}
          <img alt="" className={styles.boxArt} src={boxOpen} />
          <strong>파일을 끌어 놓거나 직접 골라 주세요</strong>
          <span>XLSX · 이름 자유 · 여러 파일 가능</span>
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
      </div>
      {acceptedIds.length > 0 && (
        <p role="status">
          {acceptedIds.length}개 파일을 올렸어요.{' '}
          <Link
            state={{ failedUploads, uploadStartedAt: uploadStartedAt.current }}
            to={`/upload/${acceptedIds.at(-1)}/result?uploads=${acceptedIds.join(',')}`}
          >
            올린 파일 결과 보기
          </Link>
        </p>
      )}

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
                    {item.period ?? '올리면 입고일자로 달을 찾아요'} ·{' '}
                    {formatFileSize(item.file.size)}
                  </span>
                </div>
                <span
                  className={styles.status}
                  data-status={item.overwrite ? 'overwrite' : item.status}
                >
                  {item.status === 'ready'
                    ? item.overwrite
                      ? '덮어쓰기 확인'
                      : '올릴 수 있어요'
                    : item.status === 'duplicate'
                      ? '이미 올린 기간 · 확인 필요'
                      : item.status === 'sameFile'
                        ? '이미 올린 파일'
                        : '형식 오류'}
                </span>
                {item.status !== 'ready' && (
                  <button
                    className={styles.detail}
                    onClick={() => setModalQueue([item.id])}
                  >
                    {item.status === 'error' ? '이유 보기' : '확인하기'}
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

      {files.length > 0 && (
        <footer className={styles.actions}>
          <div>
            <strong>고른 파일 {files.length}개</strong>
            <span>올릴 수 있는 파일 {readyFiles.length}개</span>
          </div>
          <Button onClick={() => navigate('/dashboard')} variant="secondary">
            취소
          </Button>
          {lock ? (
            <LockedButton>{`${readyFiles.length}개 올리기`}</LockedButton>
          ) : (
            <Button
              disabled={readyFiles.length === 0 || calculationBusy}
              loading={uploadAction.isPending}
              loadingLabel="올리는 중"
              onClick={() => void uploadAction.run()}
            >
              {readyFiles.length}개 올리기
            </Button>
          )}
        </footer>
      )}

      <UploadHistory />

      {modalFile && (
        <Modal labelledBy="upload-modal-title" onClose={closeModal}>
          {modalFile.status === 'duplicate' ? (
            <div className={styles.modalContent}>
              <span aria-hidden="true" className={styles.modalIcon}>
                ↻
              </span>
              <h2 id="upload-modal-title">이미 올린 기간이에요</h2>
              <p>
                {modalFile.inferredPeriod && (
                  <>입고일자로 보면 {modalFile.period}이에요. </>
                )}
                덮어쓰면 이 기간 자료를 새 파일로 바꾸고 다시 계산해요. 이전
                결과는 이력으로 남아요.
              </p>
              <div className={styles.modalFile}>
                <strong>{modalFile.file.name}</strong>
                <span>
                  {modalFile.period}
                  {modalFile.existingUpload?.originalName &&
                    ` · ${modalFile.existingUpload.originalName}`}
                  {modalFile.existingUpload?.uploadedAt &&
                    ` · ${modalFile.existingUpload.uploadedAt}에 올림`}
                </span>
              </div>
              <div className={styles.modalActions}>
                <Button onClick={closeModal} variant="secondary">
                  취소
                </Button>
                <Button onClick={() => confirmOverwrite(modalFile.id)}>
                  덮어쓰기
                </Button>
              </div>
            </div>
          ) : modalFile.status === 'sameFile' ? (
            <div className={styles.modalContent}>
              <span aria-hidden="true" className={styles.modalIcon}>
                ↻
              </span>
              <h2 id="upload-modal-title">이미 올린 파일이에요</h2>
              <p>
                내용이 똑같은 파일을 다른 달 이름으로 이미 올렸어요. 이 달
                파일이 맞는지 확인해 주세요. 같은 파일은 덮어쓸 수 없어요.
              </p>
              <div className={styles.modalFile}>
                <strong>{modalFile.file.name}</strong>
                <span>
                  {modalFile.existingUpload?.originalName ?? '다른'} 이름으로{' '}
                  {modalFile.existingUpload?.uploadedAt}에 올림
                </span>
              </div>
              <div className={styles.modalActions}>
                <Button onClick={closeModal} variant="secondary">
                  닫기
                </Button>
                <Button onClick={() => removeFile(modalFile.id)}>
                  목록에서 빼기
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
                이 파일은 목록에 넣지 않았어요. 아래 내용을 고친 뒤 다시 골라
                주세요.
              </p>
              <div className={styles.modalFile}>
                <strong>{modalFile.file.name}</strong>
                <span>{modalFile.reason}</span>
              </div>
              <div className={styles.modalActions}>
                <Button onClick={closeModal} variant="secondary">
                  확인
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
