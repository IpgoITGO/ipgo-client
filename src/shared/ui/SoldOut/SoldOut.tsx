import { useId } from 'react'

import styles from './SoldOut.module.css'

const SOLD_OUT_HINT = '예상 소진일이 지나 이미 소진됐을 수 있어요'

// 손으로 찍은 듯한 빨간 잉크 도장 "품절 주의". 속이 빈 이중 테두리에 잉크 번짐·빈 자국을 준다.
// 예상 소진일이 지났을 뿐 품절은 확인 못 했으니 "품절"이라고 단정하지 않는다(11/2 결정). 기울기는 어디서나 -4°.
export function SoldOutStamp() {
  const ink = useId()
  return (
    <svg
      aria-label={`품절 주의 · ${SOLD_OUT_HINT}`}
      className={styles.stamp}
      role="img"
      viewBox="0 0 82 28"
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
      <g fill="none" filter={`url(#${ink})`} stroke="currentColor">
        <rect height="24" rx="5" strokeWidth="2.4" width="78" x="2" y="2" />
        <rect height="17" rx="3" strokeWidth="1" width="71" x="5.5" y="5.5" />
      </g>
      <text
        fill="currentColor"
        filter={`url(#${ink})`}
        fontSize="12.5"
        fontWeight="900"
        letterSpacing="1.5"
        textAnchor="middle"
        x="41"
        y="19.2"
      >
        품절 주의
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
