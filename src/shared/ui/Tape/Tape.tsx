import styles from './Tape.module.css'

type TapeProps = {
  className?: string
}

// 상자에 붙이는 포장 테이프. 바깥은 그림자(살짝 들뜬 느낌), 안쪽은 반투명 몸통이다.
// 꾸밈이라 화면 읽기 프로그램에는 읽히지 않는다.
export function Tape({ className }: TapeProps) {
  return (
    <span
      aria-hidden="true"
      className={[styles.tape, className].filter(Boolean).join(' ')}
    >
      <i />
    </span>
  )
}
