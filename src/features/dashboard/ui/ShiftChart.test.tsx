import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ShiftChart } from './DemandShift'

describe('ShiftChart mini', () => {
  it('작은 막대도 높이를 다 써서 20배 늘면 마지막 막대가 그만큼 크다(11/13)', () => {
    const weeks = [0.4, 0.4, 0.4, 8].map((avg, i) => ({
      end: `2026-11-0${i + 1}`,
      avg,
      // 작년 값은 mini에서 안 그리니 높이 기준에도 안 들어간다
      lastYear: 30,
    }))
    const { container } = render(
      <ShiftChart mini name="케어트릿" weeks={weeks} />,
    )
    const heights = [...container.querySelectorAll('rect')].map((rect) =>
      Number(rect.getAttribute('height')),
    )
    expect(heights.at(-1)).toBeGreaterThan(30)
    expect(heights.at(-1)! / heights[0]).toBeGreaterThan(10)
  })
})
