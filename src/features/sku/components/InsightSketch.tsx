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
  lower: { quantity: number; end: number; risk: number | null } | null
}

// 품절 위험이 이 값(%) 이상이면 빨강. AI 문장의 강조와 같은 기준이다.
const HIGH_RISK = 20

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

// 시작점을 조금 넘겨 한 바퀴 더 도는 손 동그라미. 점마다 흔들면 각지니까
// 흔들림은 둘레를 따라 천천히 바뀌는 사인으로 주고, 점을 촘촘히(72개) 찍어 둥글게 보이게 한다.
function roughEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  r: () => number,
) {
  const steps = 72
  const phase = r() * Math.PI * 2
  let d = ''
  for (let i = 0; i <= steps * 1.1; i += 1) {
    const angle = -0.6 + (i / steps) * Math.PI * 2
    // 끝으로 갈수록 살짝 바깥으로 벌어져 손으로 한 번 더 감은 느낌
    const wobble = 1 + Math.sin(angle * 2 + phase) * 0.035 + (i / steps) * 0.05
    d += `${i ? 'L' : 'M'}${n(cx + Math.cos(angle) * rx * wobble)} ${n(cy + Math.sin(angle) * ry * wobble)} `
  }
  return d
}

// 밑줄을 긋다가 펜을 떼지 않고 그대로 별의 가로선이 되게 이어 그린다.
// 별은 밑줄 높이에 가로선이 오도록 아래쪽에 두고, 가로선(왼 → 오) 다음 왼쪽 아래 → 위 → 오른쪽 아래 → 왼쪽으로 한 붓에 닫는다.
function underlineStar(x1: number, x2: number, y: number, r: () => number) {
  const radius = 13
  // 별 가로선(왼쪽·오른쪽 꼭짓점)은 중심보다 radius × sin18° 위에 있다
  const cx = x2 + radius * 0.95
  const cy = y + radius * 0.31
  const vertex = (k: number) => {
    const angle = ((-90 + 72 * k) * Math.PI) / 180
    return [
      cx + Math.cos(angle) * radius + r() * 1,
      cy + Math.sin(angle) * radius + r() * 1,
    ]
  }
  let d = `M${n(x1)} ${n(y + 2)} Q${n((x1 + x2) / 2)} ${n(y - 2 + r() * 2)} ${n(x2)} ${n(y)}`
  for (const [x, yy] of [1, 3, 0, 2, 4].map(vertex)) d += ` L${n(x)} ${n(yy)}`
  return d
}

// 칸 왼쪽 위 작은 전구 낙서: 선 두 번 긋기 + 색연필 빗금(선 밖으로 조금 삐져나감)
function Bulb() {
  const r = seeded(4242)
  const arc = (
    cx: number,
    cy: number,
    radius: number,
    a0: number,
    a1: number,
    steps: number,
  ) =>
    Array.from({ length: steps + 1 }, (_, k) => {
      const t = a0 + ((a1 - a0) * k) / steps
      return [
        cx + Math.cos(t) * radius * (1 + Math.sin(t * 3) * 0.03),
        cy + Math.sin(t) * radius * (1 + Math.cos(t * 2) * 0.03),
      ]
    })
  const twice = (points: number[][], width: number, className?: string) =>
    [0, 1].map((pass) => (
      <path
        className={className ?? styles.doodle}
        d={points
          .map(
            ([x, y], i) =>
              `${i ? 'L' : 'M'}${n(x + r() * (pass ? 1.8 : 1))} ${n(y + r() * (pass ? 1.8 : 1))}`,
          )
          .join(' ')}
        key={pass}
        opacity={pass ? 0.65 : 1}
        strokeWidth={pass ? width * 0.55 : width}
      />
    ))
  const glass = [...arc(22, 17, 11, 2.25, 7.17, 22), [27, 30], [17, 30]]
  const outline = [...glass, glass[0], glass[1]]
  const rays = [
    [
      [22, 1],
      [22, 3.5],
    ],
    [
      [8, 6],
      [10, 8],
    ],
    [
      [36, 6],
      [34, 8],
    ],
  ]
  return (
    <svg aria-hidden="true" className={styles.bulb} viewBox="0 0 44 44">
      <clipPath id="sketch-bulb">
        <path
          d={`M${glass.map(([x, y]) => `${n(x * 1.04 - 0.4)} ${n(y * 1.04 + 0.2)}`).join(' L')}Z`}
        />
      </clipPath>
      <g className={styles.crayon} clipPath="url(#sketch-bulb)">
        {Array.from({ length: 40 }, (_, k) => -50 + k * 3.2).map((x) => (
          <path
            d={`M${n(x + r() * 1.5)} -6 L${n(x + 34 + r() * 2)} 52`}
            key={x}
          />
        ))}
      </g>
      {twice(outline, 2.3)}
      {twice(
        [
          [17, 33.5],
          [27, 33],
        ],
        2,
      )}
      {twice(
        [
          [18.5, 37],
          [25.5, 36.6],
        ],
        2,
      )}
      {rays.map((ray, i) => (
        <g key={i}>{twice(ray, 1.7, `${styles.doodle} ${styles.ray}`)}</g>
      ))}
    </svg>
  )
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
  // 첫 줄은 같은 기간(도착 후)끼리 비교한다: 80% 넣을 때 → 권장량 넣을 때
  const hasRisk = postRisk !== null
  // 80%가 권장량과 겹치거나 80%의 위험이 표본 부족이면 비교 없이 권장량 값만 그린다
  const lowerRisk = lower?.risk ?? null
  const preHigh = preRisk !== null && preRisk >= HIGH_RISK
  const postHigh = postRisk !== null && postRisk >= HIGH_RISK
  const gain = lower ? endRecommended - lower.end : null
  const label = [
    hasRisk
      ? lowerRisk !== null
        ? `도착 후 품절 위험 ${lowerRisk}%에서 ${postRisk}%로`
        : `도착 후 품절 위험 ${postRisk}%`
      : '품절 위험은 계산 전',
    lower
      ? `${lower.quantity}개보다 ${recommended}개를 넣으면 다음 입고 때 ${gain}개 더 남아요`
      : `${recommended}개를 넣으면 다음 입고 때 ${endRecommended}개 남아요`,
  ].join(', ')

  return (
    <figure className={styles.sketch}>
      {preHigh && (
        <figcaption className={styles.warn}>
          입고 전에 바닥날 위험 {preRisk}% · 넣는 양과 상관없어요
        </figcaption>
      )}
      <Bulb />
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
            height="5"
            id="sketch-yellow"
            patternTransform="rotate(-41)"
            patternUnits="userSpaceOnUse"
            width="5"
          >
            <line className={styles.hatchYellow} x1="0" x2="0" y1="0" y2="5" />
          </pattern>
        </defs>

        <text className={styles.caption} x="16" y={ROW1 - 30}>
          도착 후 품절 위험
        </text>
        {hasRisk ? (
          <>
            <path
              d={`${roughEllipse(AFTER, ROW1 - 4, 40, 22, r)}Z`}
              fill="url(#sketch-sage)"
            />
            {lowerRisk !== null && (
              <>
                <text
                  className={styles.before}
                  data-high={lowerRisk >= HIGH_RISK || undefined}
                  textAnchor="middle"
                  x={BEFORE}
                  y={ROW1 + 9}
                >
                  {lowerRisk}%
                </text>
                <Arrow r={r} y={ROW1 - 3} />
                <text
                  className={styles.sub}
                  textAnchor="middle"
                  x={BEFORE}
                  y={ROW1 + 33}
                >
                  {lower?.quantity}개 넣으면
                </text>
              </>
            )}
            <text
              className={styles.value}
              data-high={postHigh || undefined}
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
              x={AFTER}
              y={ROW1 + 33}
            >
              {recommended}개(권장) 넣으면
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
          d={`M${AFTER - 48} ${ROW2 - 4} L${AFTER + 48} ${ROW2 - 7} L${AFTER + 46} ${ROW2 + 13} L${AFTER - 46} ${ROW2 + 14}Z`}
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
              {gain !== null && gain < 0 ? `−${-gain}` : `+${gain}`}
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
          className={`${styles.pen} ${styles.brown} ${styles.star} ${styles.late}`}
          d={underlineStar(AFTER - 46, AFTER + 44, ROW2 + 15, r)}
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
