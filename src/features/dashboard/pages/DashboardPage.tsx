import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { apiRequest } from '../../../shared/api/client'
import { AsyncState } from '../../../shared/ui/AsyncState/AsyncState'
import { Button } from '../../../shared/ui/Button/Button'
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

export function DashboardPage() {
  const navigate = useNavigate()
  const [sort, setSort] = useState<'stockout' | 'risk' | 'cost'>('stockout')
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiRequest<DashboardData>('/dashboard'),
  })

  const items = useMemo(() => {
    const source = [...(query.data?.neededItems ?? [])]
    return source.sort((a, b) => {
      if (sort === 'cost') return b.cost - a.cost
      if (sort === 'risk') return b.risk - a.risk
      return a.stockoutDate.localeCompare(b.stockoutDate)
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
        {[
          ['지금 넣어야 해요', data.summary.needed, 'needed'],
          ['아직 괜찮아요', data.summary.safe, 'safe'],
          ['계산 불가', data.summary.unavailable, 'unavailable'],
          ['검산 제외', data.summary.excluded, 'excluded'],
        ].map(([label, value, state]) => (
          <article data-state={state} key={label}>
            <span>{label}</span>
            <strong>
              {refreshRequired ? '—' : value}
              <small>{refreshRequired ? '' : '개'}</small>
            </strong>
          </article>
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
              <select
                aria-label="입고 필요 목록 정렬"
                onChange={(event) => setSort(event.target.value as typeof sort)}
                value={sort}
              >
                <option value="stockout">소진일 빠른 순</option>
                <option value="risk">품절 위험 높은 순</option>
                <option value="cost">금액 큰 순</option>
              </select>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>상품</th>
                    <th>예상 소진일</th>
                    <th>리드타임</th>
                    <th>권장 입고량</th>
                    <th>사입비</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <span>{item.barcode}</span>
                      </td>
                      <td>{item.stockoutDate}</td>
                      <td>{item.leadTime}일</td>
                      <td>
                        <strong>{item.quantity}개</strong>
                      </td>
                      <td>{item.cost.toLocaleString()}원</td>
                      <td>
                        <Button
                          onClick={() => navigate(`/sku/${item.id}`)}
                          variant="secondary"
                        >
                          상세 보기
                        </Button>
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
