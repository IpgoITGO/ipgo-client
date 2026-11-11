import type { CSSProperties } from 'react'

import styles from './Confetti.module.css'

const COLORS = [
  '#ffc53d',
  '#04876a',
  '#1f2537',
  '#2f7bf5',
  '#e8604c',
  '#8fc7b4',
]

// 조각 44개: 위쪽 부채꼴(-165°~-15°)로 고르게 퍼지게 각도·거리·색·늦춤을 미리 정한다
// (무작위 없음 → 테스트·화면 흔들림 없음)
const PIECES = Array.from({ length: 44 }, (_, i) => {
  const angle = ((-165 + ((i * 67) % 150)) * Math.PI) / 180
  const distance = 100 + ((i * 41) % 70)
  return {
    dx: Math.round(Math.cos(angle) * distance * 1.3),
    // 위로는 덜(0.6배) 옆으로는 넓게: 위 단계 글자를 덮지 않게
    dy: Math.round(Math.sin(angle) * distance * 0.6),
    turn: ((i * 97) % 720) - 360,
    delay: (i % 4) * 18,
    color: COLORS[i % COLORS.length],
    shape: i % 3,
  }
})

/**
 * 빵빠레 한 번: 부모 안 한 점(가운데 35% 높이)에서 색종이가 부채꼴로 터져 나가 멈칫하고 작아지며 사라진다.
 * 움직임 줄이기 설정이면 안 보인다(11/11 결제 완료 상자).
 */
export function Confetti({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div aria-hidden="true" className={styles.burst}>
      {PIECES.map((piece, index) => (
        <i
          data-shape={piece.shape}
          key={index}
          style={
            {
              background: piece.color,
              animationDelay: `${delayMs + piece.delay}ms`,
              '--dx': `${piece.dx}px`,
              '--dy': `${piece.dy}px`,
              '--turn': `${piece.turn}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
