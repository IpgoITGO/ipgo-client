import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  Link,
  NavLink,
  type NavLinkProps,
  useParams,
  useLocation,
} from 'react-router-dom'
import { useAuth } from '../../../auth/model/useAuth'
import { ApiError } from '../../../shared/api/client'
import { useCalculation } from '../../../shared/api/calculationContext'
import { getUploadResult } from '../../upload/model/uploadApi'
import { env } from '../../../shared/config/env'
import { Button } from '../../../shared/ui/Button/Button'
import {
  clearAttempt,
  readAttempt,
  storeAttempt,
  type Attempt,
} from '../model/attemptStorage'
import {
  decideReview,
  getReview,
  listReviews,
  previewReview,
  reasonText,
  type Allocation,
  type DecisionRequest,
  type Source,
} from '../model/receiptApi'
import styles from './ReceiptCorrectionsPage.module.css'

export function ReceiptCorrectionsLink({
  className,
}: Pick<NavLinkProps, 'className'>) {
  const { user, status } = useAuth()
  const { pathname } = useLocation()
  const query = useQuery({
    queryKey: ['receipt-corrections', user?.email, 'summary', pathname],
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: () => listReviews(),
    enabled: status === 'authenticated',
  })
  return (
    <NavLink className={className} to="/receipt-corrections">
      입고 확인
      {query.isError
        ? ' (조회 필요)'
        : query.data
          ? ` (${query.data.items.length}${query.data.nextCursor !== null ? '건 이상' : '건'})`
          : ''}
    </NavLink>
  )
}
function Warnings({ warnings }: { warnings: string[] }) {
  return warnings.length ? (
    <ul aria-label="확인할 사항">
      {warnings.map((w, i) => (
        <li key={`${w}-${i}`}>{reasonText(w)}</li>
      ))}
    </ul>
  ) : null
}
function SourceInfo({ title, source }: { title: string; source: Source }) {
  return (
    <section>
      <h3>{title}</h3>
      <p>
        {source.present
          ? `${source.quantity.toLocaleString()}개 · ${source.valid ? '검산 가능' : '검산 확인 필요'}`
          : '이 입고 기록이 없어요.'}
      </p>
      {source.uploadId > 0 && (
        <Link to={`/upload/${source.uploadId}/result`}>
          {source.revision}차 원본의 업로드 결과 보기
        </Link>
      )}
    </section>
  )
}
function Allocations({ title, items }: { title: string; items: Allocation[] }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((a) => (
            <li key={a.receiptId}>
              발주 {a.receiptId} · {a.quantity.toLocaleString()}개 · {a.skuName}
            </li>
          ))}
        </ul>
      ) : (
        <p>배정 없음</p>
      )}
    </section>
  )
}

const stateLabel = (state: string) =>
  state === 'OPEN'
    ? '확인 필요'
    : state === 'RESOLVED'
      ? '확인 완료'
      : '상태 확인 필요'
function ReviewList() {
  const { user } = useAuth()
  const [state, setState] = useState('OPEN')
  const query = useInfiniteQuery({
    queryKey: ['receipt-corrections', user?.email, 'list', state],
    initialPageParam: 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: ({ pageParam }) => listReviews(state, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  return (
    <>
      <label>
        보기{' '}
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="OPEN">확인 필요</option>
          <option value="RESOLVED">확인 완료</option>
          <option value="ALL">전체 이력</option>
        </select>
      </label>
      {query.isPending ? (
        <p role="status">입고 확인 목록을 불러오고 있어요.</p>
      ) : query.isError ? (
        <p role="alert">
          입고 확인 목록을 불러오지 못했어요.{' '}
          <Button onClick={() => void query.refetch()}>다시 불러오기</Button>
        </p>
      ) : (
        <>
          {query.data.pages.every((page) => page.items.length === 0) && (
            <p>이 목록에 표시할 입고가 없어요.</p>
          )}
          <ul className={styles.list}>
            {query.data.pages
              .flatMap((p) => p.items)
              .map((r) => (
                <li key={r.reviewId}>
                  <Link to={`/receipt-corrections/${r.reviewId}`}>
                    {r.skuName} · {r.stockDate} · {stateLabel(r.currentState)}
                  </Link>
                  <Warnings warnings={r.warnings} />
                </li>
              ))}
          </ul>
          {query.hasNextPage && (
            <Button
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              다음 항목 보기
            </Button>
          )}
        </>
      )}
    </>
  )
}
function ReviewDetail({ id, owner }: { id: number; owner: string }) {
  const client = useQueryClient()
  const calculation = useCalculation()
  const query = useQuery({
    queryKey: ['receipt-correction', owner, id],
    queryFn: () => getReview(id),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const [attempt, setAttempt] = useState<Attempt | null>(() =>
    readAttempt(owner, id),
  )
  const [choice, setChoice] = useState(
    attempt
      ? attempt.request.action === 'KEEP'
        ? 'KEEP'
        : attempt.request.receiptIds.length
          ? 'REPLACE'
          : 'CLEAR'
      : '',
  )
  const [selected, setSelected] = useState<number[]>(
    attempt?.request.receiptIds ?? [],
  )
  const [reason, setReason] = useState(attempt?.request.reason ?? '')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState('')
  const errorFocus = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (error) errorFocus.current?.focus()
  }, [error])
  const [saved, setSaved] = useState<string | null>(null)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const reasonInput = useRef<HTMLTextAreaElement>(null)
  const editFocus = useRef(false)
  useEffect(() => {
    if (attempt?.phase === 'ready') previewHeading.current?.focus()
    if (!attempt && editFocus.current) {
      reasonInput.current?.focus()
      editFocus.current = false
    }
  }, [attempt, query.isSuccess])
  const detail = query.data
  const latestUploadId = detail?.currentSource.uploadId
  const latestUpload = useQuery({
    queryKey: ['upload-result', String(latestUploadId)],
    queryFn: () => getUploadResult(String(latestUploadId)),
    enabled: !!detail && !detail.sourceReady && !!latestUploadId,
  })
  const unknown = attempt?.phase === 'unknown'
  const attemptAllowed =
    !!attempt &&
    !!detail &&
    (attempt.request.action === 'KEEP'
      ? detail.capabilities.keep
      : attempt.request.receiptIds.length
        ? detail.capabilities.replace
        : detail.capabilities.clear)
  const changed =
    !!attempt &&
    (attempt.request.expectedVersion !== detail?.version ||
      (!unknown && (!detail?.sourceReady || !attemptAllowed)))
  const invalidSelection = selected.some(
    (id) => !detail?.candidates.some((c) => c.receiptId === id && c.selectable),
  )
  const writable = !!detail && Object.values(detail.capabilities).some(Boolean)
  const allowed =
    !query.isError &&
    !!detail?.sourceReady &&
    ((choice === 'KEEP' && detail.capabilities.keep) ||
      (choice === 'REPLACE' &&
        detail.capabilities.replace &&
        selected.length > 0 &&
        !invalidSelection) ||
      (choice === 'CLEAR' && detail.capabilities.clear))
  function invalidate() {
    void client.invalidateQueries({ queryKey: ['receipt-corrections', owner] })
    void client.invalidateQueries({
      queryKey: ['receipt-correction', owner, id],
    })
    for (const root of [
      'planned-receipts',
      'inbound-settings',
      'products',
      'sku',
      'dashboard',
      'upload-result',
      'upload-periods',
    ])
      void client.invalidateQueries({ queryKey: [root] })
  }
  async function run(work: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        e.code !== 'RECEIPT_CORRECTION_KEY_CONFLICT'
      ) {
        clearAttempt(owner, id)
        setAttempt(null)
        setConfirmed(false)
        setChoice('')
        setSelected([])
        invalidate()
      }
      if (e instanceof ApiError && [400, 401, 403].includes(e.status)) {
        clearAttempt(owner, id)
        setAttempt(null)
        setConfirmed(false)
      }
      setError(
        e instanceof ApiError && e.status === 403
          ? '이 입고를 확인할 권한이 없어요.'
          : e instanceof Error
            ? e.message
            : '처리 결과를 확인하지 못했어요.',
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  async function prepare() {
    if (!detail || !allowed || !reason.trim() || reason.trim().length > 500)
      return
    await run(async () => {
      const request: DecisionRequest = {
        expectedVersion: detail.version,
        action: choice === 'KEEP' ? 'KEEP' : 'REPLACE',
        receiptIds:
          choice === 'REPLACE' ? [...selected].sort((a, b) => a - b) : [],
        reason: reason.trim(),
        idempotencyKey: crypto.randomUUID(),
      }
      const response = await previewReview(id, {
        expectedVersion: request.expectedVersion,
        action: request.action,
        receiptIds: request.receiptIds,
      })
      if (
        response.version !== request.expectedVersion ||
        response.action !== request.action
      )
        throw new Error('자료가 바뀌었어요. 최신 내용을 다시 확인해 주세요.')
      const next: Attempt = { request, preview: response, phase: 'ready' }
      try {
        storeAttempt(owner, id, next)
      } catch {
        throw new Error('확인 내용을 이 탭에 보관하지 못해 저장을 중단했어요.')
      }
      setAttempt(next)
      setConfirmed(false)
    })
  }
  async function submit() {
    if (
      !attempt ||
      query.isError ||
      (!unknown && (!confirmed || changed || !detail?.sourceReady))
    )
      return
    await run(async () => {
      const pending: Attempt = { ...attempt, phase: 'unknown' }
      try {
        storeAttempt(owner, id, pending)
      } catch {
        throw new Error('확인 내용을 보관하지 못해 저장을 중단했어요.')
      }
      setAttempt(pending)
      const response = await decideReview(id, pending.request)
      clearAttempt(owner, id)
      setAttempt(null)
      setSaved(
        response.runId
          ? '정정 내용을 저장했어요. 후속 계산의 진행·실패는 계산 상태 창에서 따로 확인해 주세요.'
          : '정정 내용을 저장했어요. 최신 확인 상태를 아래에서 확인해 주세요.',
      )
      setConfirmed(false)
      setChoice('')
      setSelected([])
      setReason('')
      invalidate()
      if (response.runId) calculation.trackRun(response.runId)
    })
  }
  function edit() {
    if (unknown) return
    clearAttempt(owner, id)
    setAttempt(null)
    setConfirmed(false)
    setChoice('')
    setSelected([])
    editFocus.current = true
  }
  if (query.isPending)
    return <p role="status">입고 확인 내용을 불러오고 있어요.</p>
  if (
    !detail ||
    (query.error instanceof ApiError && [401, 403].includes(query.error.status))
  )
    return (
      <p role="alert">
        {query.error instanceof ApiError && query.error.status === 403
          ? '이 입고를 확인할 권한이 없어요.'
          : '입고 확인 내용을 불러오지 못했어요.'}
        <Button onClick={() => void query.refetch()}>다시 불러오기</Button>
      </p>
    )
  return (
    <>
      <Link to="/receipt-corrections">← 입고 확인 목록</Link>
      <h2>
        {detail.skuName} · {detail.stockDate}
      </h2>
      <p>{stateLabel(detail.currentState)}</p>
      {query.isError && (
        <p role="alert">
          최신 확인 내용을 불러오지 못했어요. 이전 이력은 유지합니다.
          <Button onClick={() => void query.refetch()}>다시 불러오기</Button>
        </p>
      )}
      {saved && <p role="status">{saved}</p>}
      {error && (
        <p id="correction-error" role="alert" tabIndex={-1} ref={errorFocus}>
          {error}
        </p>
      )}
      {!detail.sourceReady && (
        <p role="status">
          {latestUpload.data?.status === 'FAILED'
            ? '최신 원본 정제에 실패했어요.'
            : latestUpload.data?.status === 'PROCESSING'
              ? '최신 원본을 정제하고 있어요.'
              : '최신 원본이 확인되기 전에는 확정할 수 없어요.'}{' '}
          이전 원본과 배정·이력은 보존합니다.{' '}
          <Button
            onClick={() => {
              void query.refetch()
              void latestUpload.refetch()
            }}
          >
            최신 상태 다시 확인
          </Button>
        </p>
      )}
      <div className={styles.grid}>
        <SourceInfo title="처음 확인한 원본" source={detail.originalSource} />
        <SourceInfo title="최신 원본" source={detail.currentSource} />
      </div>
      <Warnings warnings={detail.warnings} />
      <Allocations title="현재 연결된 발주" items={detail.allocations} />
      <fieldset
        disabled={
          busy || !!attempt || !detail.sourceReady || query.isError || !writable
        }
        className={styles.form}
      >
        <legend>입고 처리 선택</legend>
        <label>
          <input
            type="radio"
            name="correction-action"
            value="KEEP"
            checked={choice === 'KEEP'}
            disabled={!detail.capabilities.keep}
            onChange={() => {
              setChoice('KEEP')
              setSelected([])
            }}
          />
          기존 입고 처리 유지
        </label>
        <label>
          <input
            type="radio"
            name="correction-action"
            value="REPLACE"
            checked={choice === 'REPLACE'}
            disabled={!detail.capabilities.replace}
            onChange={() => {
              setChoice('REPLACE')
              setSelected([])
            }}
          />
          배정 다시 정하기
        </label>
        <label>
          <input
            type="radio"
            name="correction-action"
            value="CLEAR"
            checked={choice === 'CLEAR'}
            disabled={!detail.capabilities.clear}
            onChange={() => {
              setChoice('CLEAR')
              setSelected([])
            }}
          />
          기존 배정 모두 해제
        </label>
        {choice === 'REPLACE' && (
          <fieldset>
            <legend>전량으로 배정할 발주를 직접 고르세요</legend>
            {detail.candidates.map((c) => (
              <label key={c.receiptId}>
                <input
                  type="checkbox"
                  checked={selected.includes(c.receiptId)}
                  disabled={!c.selectable}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, c.receiptId]
                        : ids.filter((id) => id !== c.receiptId),
                    )
                  }
                />
                발주 {c.receiptId} · {c.quantity.toLocaleString()}개 ·{' '}
                {c.expectedOn ?? '예정일 없음'}
                {!c.selectable && ' · 선택 불가'}
              </label>
            ))}
            <p>
              선택 합계{' '}
              {detail.candidates
                .filter((c) => selected.includes(c.receiptId))
                .reduce((sum, c) => sum + c.quantity, 0)
                .toLocaleString()}
              개
            </p>
          </fieldset>
        )}
        <label htmlFor={`reason-${id}`}>확인 이유</label>
        <textarea
          id={`reason-${id}`}
          ref={reasonInput}
          maxLength={500}
          value={reason}
          aria-describedby={error ? 'correction-error' : undefined}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button
          disabled={!allowed || !reason.trim() || busy}
          onClick={() => void prepare()}
          type="button"
        >
          변경 영향 미리보기
        </Button>
      </fieldset>
      {attempt && (
        <section className={styles.preview} aria-labelledby="preview-title">
          <h2 id="preview-title" ref={previewHeading} tabIndex={-1}>
            저장 전 변경 영향
          </h2>
          <p>
            선택:{' '}
            {attempt.request.action === 'KEEP'
              ? '기존 입고 처리 유지'
              : attempt.request.receiptIds.length
                ? '배정 다시 정하기'
                : '기존 배정 모두 해제'}
          </p>
          <p>이유: {attempt.request.reason}</p>
          <div className={styles.grid}>
            <Allocations title="변경 전 배정" items={attempt.preview.before} />
            <Allocations title="변경 후 배정" items={attempt.preview.after} />
          </div>
          <ul>
            {attempt.preview.changes.map((c) => (
              <li key={c.receiptId}>
                발주 {c.receiptId}:{' '}
                {c.beforeStatus === 'RECEIVED'
                  ? '입고 완료'
                  : c.beforeStatus === 'PLANNED'
                    ? '입고 예정'
                    : '처리 상태 확인'}{' '}
                →{' '}
                {c.afterStatus === 'RECEIVED'
                  ? '입고 완료'
                  : c.afterStatus === 'PLANNED'
                    ? '입고 예정'
                    : '처리 상태 확인'}{' '}
                · 예정 물량 계산 {c.beforeReflected ? '반영' : '미반영'} →{' '}
                {c.afterReflected ? '반영' : '미반영'}
              </li>
            ))}
          </ul>
          <Warnings warnings={attempt.preview.warnings} />
          {attempt.preview.mayRecalculate && (
            <p>
              저장 뒤 입고량을 다시 계산할 수 있어요. 정정 저장과 계산 완료는
              별개예요.
            </p>
          )}
          {unknown ? (
            <>
              <p role={busy ? 'status' : 'alert'}>
                {busy
                  ? '저장 결과를 확인하고 있어요.'
                  : '저장 결과를 확인하지 못했어요. 내용을 바꾸지 않고 같은 요청의 결과를 확인해 주세요.'}
              </p>
              <Button
                disabled={busy || query.isError}
                onClick={() => void submit()}
              >
                같은 저장 요청 결과 확인
              </Button>
              <Button
                disabled={busy}
                onClick={() => void query.refetch()}
                variant="text"
              >
                현재 상태 조회
              </Button>
            </>
          ) : (
            <>
              {changed && (
                <p role="alert">
                  미리보기 뒤 자료가 바뀌었어요. 최신 내용을 다시 검토해 주세요.
                </p>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={busy || changed}
                />
                변경 영향과 원본의 경고를 확인했어요
              </label>
              <Button
                disabled={
                  !confirmed ||
                  busy ||
                  changed ||
                  query.isError ||
                  !detail.sourceReady
                }
                onClick={() => void submit()}
              >
                정정 내용 저장
              </Button>
              <Button disabled={busy} onClick={edit} variant="secondary">
                내용 다시 검토
              </Button>
            </>
          )}
        </section>
      )}
      <section>
        <h3>확인 이력</h3>
        {detail.decisions.length ? (
          <ul>
            {detail.decisions.map((d) => (
              <li key={d.decisionId}>
                {d.createdAt} ·{' '}
                {d.action === 'KEEP' ? '기존 처리 유지' : '배정 변경'} ·{' '}
                {d.reason}
              </li>
            ))}
          </ul>
        ) : (
          <p>아직 수동 확인 이력이 없어요.</p>
        )}
      </section>
    </>
  )
}
export function ReceiptCorrectionsPage() {
  const { reviewId } = useParams()
  const { user } = useAuth()
  const id = reviewId ? Number(reviewId) : null
  if (!user) return <p>로그인을 확인하고 있어요.</p>
  if (reviewId && (!Number.isSafeInteger(id) || !id || id < 1))
    return <p role="alert">올바른 입고 확인 주소가 아니에요.</p>
  return (
    <div className={styles.page}>
      <h1>입고 확인</h1>
      <p>
        원본 입고와 연결된 발주를 비교하고 직접 확인해 주세요. 조회만으로
        확정하지 않아요.
      </p>
      {env.enableMsw && (
        <p role="note">
          시험 자료 화면이에요. 이 화면의 확인 결과는 실제 서버에 저장되지
          않아요.
        </p>
      )}
      {id ? (
        <ReviewDetail key={`${user.email}-${id}`} id={id} owner={user.email} />
      ) : (
        <ReviewList />
      )}
    </div>
  )
}
