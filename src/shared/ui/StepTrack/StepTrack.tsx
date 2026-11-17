import type { CSSProperties } from 'react'

import styles from './StepTrack.module.css'

// 단계 표시: 동그라미를 첫 단계 가운데에서 끝 단계 가운데까지 한 줄로 잇는다(11/17 "처음과 끝을 이어야지").
// at = 지금 단계(0부터, 단계 수와 같으면 모두 끝남) · fill = 지금 단계에서 다음 단계로 가는 선이 찬 만큼(0~1)
export function StepTrack({
  at,
  busy = false,
  fill = 0,
  label,
  steps,
}: {
  at: number
  /** 지금 단계가 진행 중이면 동그라미 둘레에 도는 고리를 그린다 */
  busy?: boolean
  fill?: number
  label: string
  steps: readonly string[]
}) {
  const last = steps.length - 1
  const progress = Math.min(
    1,
    (Math.min(at, last) + (at < last ? Math.min(1, Math.max(0, fill)) : 0)) /
      last,
  )
  return (
    <ol
      aria-label={label}
      className={styles.track}
      style={{ '--n': steps.length, '--p': progress } as CSSProperties}
    >
      {steps.map((step, index) => {
        const state = index < at ? 'done' : index === at ? 'now' : 'next'
        return (
          <li
            aria-current={state === 'now' ? 'step' : undefined}
            data-busy={(busy && state === 'now') || undefined}
            data-state={state}
            key={step}
          >
            <b aria-hidden="true">
              {state === 'done' ? (
                <svg height="12" viewBox="0 0 12 12" width="12">
                  <path d="M2.5 6.4 5 8.8l4.5-5.4" pathLength="1" />
                </svg>
              ) : (
                index + 1
              )}
            </b>
            {step}
          </li>
        )
      })}
    </ol>
  )
}
