import { useId } from 'react'

import styles from './SoldOut.module.css'

const SOLD_OUT_HINT = '예상 소진일이 지나 이미 소진됐을 수 있어요'

// 택배 상자에 손으로 찍은 듯한 빨간 잉크 도장 "품절". 배경 잉크에만 번짐·빈 자국을 주고 글자는 또렷하게 둔다.
// 줄마다 조금씩 다르게 기울여(tilt) 기계로 찍은 느낌을 뺀다.
export function SoldOutStamp({ tilt = -5 }: { tilt?: number }) {
  const ink = useId()
  return (
    <svg
      aria-label={`품절 · ${SOLD_OUT_HINT}`}
      className={styles.stamp}
      role="img"
      style={{ transform: `rotate(${tilt}deg)` }}
      viewBox="0 0 60 28"
    >
      <title>{SOLD_OUT_HINT}</title>
      <filter height="140%" id={ink} width="120%" x="-10%" y="-20%">
        <feTurbulence
          baseFrequency="1.1"
          numOctaves={2}
          result="noise"
          seed={7}
          type="fractalNoise"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          result="wobble"
          scale={1.2}
        />
        <feTurbulence
          baseFrequency="2.6"
          numOctaves={1}
          result="grain"
          seed={5}
          type="fractalNoise"
        />
        <feColorMatrix
          in="grain"
          result="holes"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.9"
        />
        <feComposite in="wobble" in2="holes" operator="in" />
      </filter>
      <g filter={`url(#${ink})`}>
        <rect
          fill="currentColor"
          height="25"
          rx="5"
          width="57"
          x="1.5"
          y="1.5"
        />
        <rect
          fill="none"
          height="19"
          opacity="0.85"
          rx="3"
          stroke="#fff"
          strokeWidth="1.2"
          width="51"
          x="4.5"
          y="4.5"
        />
      </g>
      <text
        fill="#fff"
        fontSize="15"
        fontWeight="900"
        letterSpacing="3"
        textAnchor="middle"
        x="30"
        y="19.8"
      >
        품절
      </text>
    </svg>
  )
}

// 로고 상자를 뚜껑 열린 빈 상자로. "다 팔려서 비었다"를 그림으로 보여 준다.
export function EmptyBoxIcon() {
  return (
    <svg aria-hidden="true" className={styles.box} viewBox="0 0 26 24">
      <polygon fill="#f1c890" points="1,6 11,2 9,-1 -1,3" />
      <polygon fill="#e0a868" points="11,2 25,6 27,2 13,-1" />
      <polygon fill="#7a4f28" points="1,6 13,10 25,6 11,2" />
      <polygon fill="#5e3a1c" points="3,7 13,10.4 23,7 13,4" />
      <polygon fill="#e9b273" points="1,6 13,10 13,23 1,18.5" />
      <polygon fill="#cf9354" points="13,10 25,6 25,18.5 13,23" />
      <polygon
        fill="#ffc53d"
        opacity="0.9"
        points="5,7.4 9,8.7 9,21.3 5,19.8"
      />
    </svg>
  )
}
