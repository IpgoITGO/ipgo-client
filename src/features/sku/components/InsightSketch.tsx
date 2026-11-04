import styles from './InsightSketch.module.css'

// AI 인사이트 옆 손그림 요약. AI 문장이 아니라 같은 계산값(시나리오 응답)으로 그려서 계산이 바뀌면 같이 바뀐다.
// 손그림 기법(두 번 긋기·살짝 흔들기·빗금)은 Rough.js/Rough Notation을 참고해 라이브러리 없이 SVG로 그린다.
export type SketchValues = {
  recommended: number
  // 도착 전·후 품절 위험(%). 표본 부족이면 null
  preRisk: number | null
  postRisk: number | null
  // 권장량을 넣었을 때 다음 입고 때 남는 재고
  endRecommended: number
  // 비교 대상(80%) 수량과 그때 남는 재고. 80%가 권장량과 겹치면 없다.
  lower: { quantity: number; end: number } | null
}

// 같은 숫자면 매번 같은 손그림이 나오도록 씨앗을 고정한 난수
function seeded(seed: number) {
  let state = (Math.abs(seed) % 2147483646) + 1
  return () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647 - 0.5
  }
}

const n = (value: number) => value.toFixed(1)

function roughLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: () => number,
) {
  let d = ''
  for (let pass = 0; pass < 2; pass += 1) {
    d += `M${n(x1 + r() * 1.2)} ${n(y1 + r() * 1.2)} Q${n((x1 + x2) / 2 + r() * 2.4)} ${n((y1 + y2) / 2 + r() * 2.4)} ${n(x2 + r() * 1.2)} ${n(y2 + r() * 1.2)} `
  }
  return d
}

// 시작점을 조금 넘겨 한 바퀴 더 도는 손 동그라미
function roughEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  r: () => number,
) {
  const steps = 22
  let d = ''
  for (let i = 0; i <= steps * 1.12; i += 1) {
    const angle = -0.6 + (i / steps) * Math.PI * 2
    const wobble = 1 + r() * 0.06
    d += `${i ? 'L' : 'M'}${n(cx + Math.cos(angle) * rx * wobble)} ${n(cy + Math.sin(angle) * ry * wobble)} `
  }
  return d
}

function roughStar(cx: number, cy: number, radius: number, r: () => number) {
  let d = ''
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i <= 10; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5
      const length = (i % 2 ? radius * 0.45 : radius) * (1 + r() * 0.12)
      d += `${i ? 'L' : 'M'}${n(cx + Math.cos(angle) * length + r() * 1.2)} ${n(cy + Math.sin(angle) * length + r() * 1.2)} `
    }
  }
  return d
}

function Arrow({ y, r }: { y: number; r: () => number }) {
  return (
    <path
      className={styles.pen}
      d={`${roughLine(124, y, 196, y, r)}M187 ${y - 7} L196 ${y} L187 ${y + 7}`}
    />
  )
}

// 칸 규격: 그림 360 × 210, 두 줄 모두 [전 값(가운데 x=80) → 화살표 124~196 → 후 값(가운데 x=252)]
const BEFORE = 80
const AFTER = 252
const ROW1 = 62
const ROW2 = 152

export function InsightSketch({ values }: { values: SketchValues }) {
  const { recommended, preRisk, postRisk, endRecommended, lower } = values
  const r = seeded(recommended * 7 + endRecommended)
  const hasRisk = preRisk !== null && postRisk !== null
  const gain = lower ? endRecommended - lower.end : null
  const label = [
    hasRisk
      ? `품절 위험 ${preRisk}%에서 ${postRisk}%로`
      : '품절 위험은 계산 전',
    lower
      ? `${lower.quantity}개보다 ${recommended}개를 넣으면 다음 입고 때 ${gain}개 더 남아요`
      : `${recommended}개를 넣으면 다음 입고 때 ${endRecommended}개 남아요`,
  ].join(', ')

  return (
    <figure className={styles.sketch}>
      <svg aria-label={label} role="img" viewBox="0 0 360 210">
        <defs>
          <pattern
            height="6"
            id="sketch-sage"
            patternTransform="rotate(-41)"
            patternUnits="userSpaceOnUse"
            width="6"
          >
            <line className={styles.hatchSage} x1="0" x2="0" y1="0" y2="6" />
          </pattern>
          <pattern
            height="6"
            id="sketch-yellow"
            patternTransform="rotate(-41)"
            patternUnits="userSpaceOnUse"
            width="6"
          >
            <line className={styles.hatchYellow} x1="0" x2="0" y1="0" y2="6" />
          </pattern>
        </defs>

        <text className={styles.caption} x="16" y={ROW1 - 30}>
          품절 위험
        </text>
        {hasRisk ? (
          <>
            <path
              d={`${roughEllipse(AFTER, ROW1 - 4, 40, 22, r)}Z`}
              fill="url(#sketch-sage)"
            />
            <text
              className={styles.before}
              textAnchor="middle"
              x={BEFORE}
              y={ROW1 + 9}
            >
              {preRisk}%
            </text>
            <Arrow r={r} y={ROW1 - 3} />
            <text
              className={styles.value}
              textAnchor="middle"
              x={AFTER}
              y={ROW1 + 9}
            >
              {postRisk}%
            </text>
            <path
              className={`${styles.pen} ${styles.sage} ${styles.late}`}
              d={roughEllipse(AFTER, ROW1 - 4, 40, 22, r)}
            />
            <text
              className={styles.sub}
              textAnchor="middle"
              x={BEFORE}
              y={ROW1 + 33}
            >
              도착 전
            </text>
            <text
              className={styles.sub}
              textAnchor="middle"
              x={AFTER}
              y={ROW1 + 33}
            >
              도착 후(권장량)
            </text>
          </>
        ) : (
          <text className={styles.pending} x={BEFORE - 40} y={ROW1 + 9}>
            표본이 부족해 계산 전이에요
          </text>
        )}

        <text className={styles.caption} x="16" y={ROW2 - 30}>
          다음 입고 때 남는 재고
        </text>
        <path
          d={`M${AFTER - 46} ${ROW2 + 2} L${AFTER + 46} ${ROW2 - 1} L${AFTER + 44} ${ROW2 + 12} L${AFTER - 44} ${ROW2 + 13}Z`}
          fill="url(#sketch-yellow)"
        />
        {lower && (
          <>
            <text
              className={styles.before}
              textAnchor="middle"
              x={BEFORE}
              y={ROW2 + 9}
            >
              {lower.end}개
            </text>
            <Arrow r={r} y={ROW2 - 3} />
            <text
              className={styles.plus}
              textAnchor="middle"
              x="160"
              y={ROW2 - 12}
            >
              {gain !== null && gain >= 0 ? `+${gain}` : gain}
            </text>
            <text
              className={styles.sub}
              textAnchor="middle"
              x={BEFORE}
              y={ROW2 + 32}
            >
              {lower.quantity}개 넣으면
            </text>
          </>
        )}
        <text
          className={styles.value}
          textAnchor="middle"
          x={AFTER}
          y={ROW2 + 9}
        >
          {endRecommended}개
        </text>
        <path
          className={`${styles.pen} ${styles.brown} ${styles.late}`}
          d={roughLine(AFTER - 44, ROW2 + 15, AFTER + 44, ROW2 + 13, r)}
        />
        <path
          className={`${styles.pen} ${styles.star} ${styles.last}`}
          d={roughStar(AFTER + 66, ROW2 - 14, 11, r)}
        />
        <text
          className={styles.sub}
          textAnchor="middle"
          x={AFTER}
          y={ROW2 + 32}
        >
          {recommended}개(권장) 넣으면
        </text>
      </svg>
    </figure>
  )
}
