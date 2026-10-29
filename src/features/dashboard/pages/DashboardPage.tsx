import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { apiRequest } from '../../../shared/api/client'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { useCountUp } from '../../../shared/hooks/useCountUp'
import { Button } from '../../../shared/ui/Button/Button'
import { Tape } from '../../../shared/ui/Tape/Tape'
import styles from './DashboardPage.module.css'

export type DashboardData = {
  baseDate: string
  freshness: 'fresh' | 'stale-result' | 'refresh-required'
  lastCalculatedAt?: string
  summary: {
    needed: number
    safe: number
    unavailable: number
    excluded: number
  }
  neededItems: Array<{
    id: string
    name: string
    barcode: string
    stockoutDate: string
    leadTime: number
    quantity: number
    cost: number
    risk: number
  }>
  unavailableItems: Array<{ name: string; reason: string }>
  excludedItems: Array<{ name: string; reason: string }>
}

// 숫자 카드. "지금 넣어야 해요"는 투톤 대신 흰 상자에 테이프를 붙여 급한 상자로 표시한다.
function SummaryCard({
  empty,
  label,
  note,
  state,
  value,
}: {
  empty: boolean
  label: string
  note: string
  state: string
  value: number
}) {
  const shown = useCountUp(value)

  return (
    <article data-state={state}>
      {state === 'needed' && !empty && <Tape className={styles.tape} />}
      <span>{label}</span>
      <strong>
        {empty ? '—' : shown}
        <small>{empty ? '' : '개'}</small>
      </strong>
      {!empty && <em>{note}</em>}
    </article>
  )
}

type SortKey = 'stockout' | 'risk' | 'cost'

// "2026. 9. 5" 같은 날짜를 자릿수 맞춘 "20260905"로 바꿔 글자 비교로도 날짜 순이 되게 한다.
function dateKey(date: string) {
  return date
    .split('.')
    .map((part) => part.trim().padStart(2, '0'))
    .join('')
}

// 브라우저 기본 드롭다운 대신 한눈에 보이는 버튼형 정렬
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'stockout', label: '소진일 빠른 순' },
  { value: 'risk', label: '품절 위험 높은 순' },
  { value: 'cost', label: '금액 큰 순' },
]

export function DashboardPage() {
  const navigate = useNavigate()
  const [sort, setSort] = useState<SortKey>('stockout')
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiRequest<DashboardData>('/dashboard'),
  })

  const items = useMemo(() => {
    const source = [...(query.data?.neededItems ?? [])]
    return source.sort((a, b) => {
      if (sort === 'cost') return b.cost - a.cost
      if (sort === 'risk') return b.risk - a.risk
      return dateKey(a.stockoutDate).localeCompare(dateKey(b.stockoutDate))
    })
  }, [query.data?.neededItems, sort])

  if (query.isPending)
    return (
      <AsyncState
        description="최근 입고 계산 결과를 모으고 있어요."
        status="loading"
        title="대시보드를 불러오고 있어요"
      />
    )
  if (query.isError)
    return (
      <AsyncState
        description={query.error.message}
        onRetry={() => void query.refetch()}
        status="error"
        title="대시보드를 불러오지 못했어요"
      />
    )

  const data = query.data
  const refreshRequired = data.freshness === 'refresh-required'

  return (
    <div className={styles.page}>
      {data.freshness !== 'fresh' && (
        <aside className={styles.banner} data-state={data.freshness}>
          <span aria-hidden="true" className={styles.bannerMark}>
            !
          </span>
          <div>
            <strong>
              {refreshRequired ? '새 수불부가 필요해요' : '갱신 전 결과예요'}
            </strong>
            <span>
              {refreshRequired
                ? '마지막 자료가 오늘보다 7일 넘게 오래되어 계산하지 않았어요.'
                : `마지막 계산이 실패해 ${data.lastCalculatedAt} 계산 결과를 보여주고 있어요.`}
            </span>
          </div>
          <Button
            onClick={() => navigate(refreshRequired ? '/upload' : '/settings')}
          >
            {refreshRequired ? '수불부 업로드' : '입고 조건에서 다시 계산'}
          </Button>
        </aside>
      )}

      <header className={styles.intro}>
        <div>
          <h1>
            {refreshRequired
              ? '수불부를 올리면 다시 계산해요'
              : `지금 넣어야 할 상품이 ${data.summary.needed}개 있어요`}
          </h1>
          <div className={styles.meta}>
            <span>기준일 {data.baseDate}</span>
            <b data-state={data.freshness}>
              {refreshRequired
                ? '재업로드 필요'
                : data.freshness === 'stale-result'
                  ? '갱신 전'
                  : '오늘까지 예상 출고 반영'}
            </b>
          </div>
        </div>
        <Button onClick={() => navigate('/upload')}>수불부 업로드</Button>
      </header>

      <section className={styles.summary} aria-label="입고 예측 요약">
        {(
          [
            [
              '지금 넣어야 해요',
              data.summary.needed,
              'needed',
              '오늘 발주해야 제때 도착해요',
            ],
            [
              '아직 괜찮아요',
              data.summary.safe,
              'safe',
              '다음 입고까지 버텨요',
            ],
            [
              '계산 불가',
              data.summary.unavailable,
              'unavailable',
              '판매 기록이 부족해요',
            ],
            [
              '검산 제외',
              data.summary.excluded,
              'excluded',
              '재고 숫자가 맞지 않아요',
            ],
          ] as const
        ).map(([label, value, state, note]) => (
          <SummaryCard
            empty={refreshRequired}
            key={label}
            label={label}
            note={note}
            state={state}
            value={value}
          />
        ))}
      </section>

      {refreshRequired ? (
        <AsyncState
          description="오래된 자료로 계산한 숫자를 보여주지 않아요. 풀필먼트에서 최근 수불부를 받아 올려 주세요."
          status="empty"
          title="입고 필요 목록이 비어 있어요"
        />
      ) : (
        <>
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>입고가 필요한 상품</h2>
                <p>오늘 기준 리드타임 안에 재고가 떨어질 상품이에요.</p>
              </div>
              <div
                aria-label="입고 필요 목록 정렬"
                className={styles.sort}
                role="radiogroup"
              >
                {SORT_OPTIONS.map((option) => (
                  <button
                    aria-checked={sort === option.value}
                    key={option.value}
                    onClick={() => setSort(option.value)}
                    role="radio"
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>상품</th>
                    <th>예상 소진일</th>
                    <th className={styles.num}>리드타임</th>
                    <th className={styles.num}>품절 위험</th>
                    <th className={styles.num}>권장 입고량</th>
                    <th className={styles.num}>사입비</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    // 줄 전체를 눌러 상세로 간다. 키보드·화면 읽기용으로 상품명은 링크로 둔다.
                    <tr
                      className={styles.rowLink}
                      key={item.id}
                      onClick={() => navigate(`/sku/${item.id}`)}
                    >
                      <td>
                        <Link to={`/sku/${item.id}`}>{item.name}</Link>
                        <span>{item.barcode}</span>
                      </td>
                      <td>{item.stockoutDate}</td>
                      <td className={styles.num}>{item.leadTime}일</td>
                      <td className={styles.num}>{item.risk}%</td>
                      <td className={styles.num}>
                        <strong>{item.quantity}개</strong>
                      </td>
                      <td className={styles.num}>
                        {item.cost.toLocaleString()}원
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className={styles.lowerGrid}>
            <section className={styles.card}>
              <h2>계산 불가</h2>
              {data.unavailableItems.map((item) => (
                <article className={styles.reason} key={item.name}>
                  <strong>{item.name}</strong>
                  <span>{item.reason}</span>
                </article>
              ))}
            </section>
            <section className={styles.card}>
              <h2>검산 제외</h2>
              {data.excludedItems.map((item) => (
                <article className={styles.reason} key={item.name}>
                  <strong>{item.name}</strong>
                  <span>{item.reason}</span>
                </article>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
