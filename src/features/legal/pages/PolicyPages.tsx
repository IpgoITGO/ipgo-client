import { Link } from 'react-router-dom'

import { signupPolicy } from '../model/signupPolicy'
import styles from './PolicyPages.module.css'

export function PolicyLinks() {
  if (!signupPolicy) return null
  return (
    <footer className={styles.links}>
      <nav aria-label="약관과 개인정보">
        <Link to="/terms" target="_blank" rel="noopener noreferrer">
          이용약관
        </Link>
        <Link to="/privacy" target="_blank" rel="noopener noreferrer">
          개인정보 처리방침
        </Link>
      </nav>
    </footer>
  )
}

export function PolicyPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const title = kind === 'terms' ? '이용약관' : '개인정보 처리방침'
  return (
    <main className={styles.page}>
      <Link to="/">ITGO 홈으로</Link>
      <article>
        <h1>{title}</h1>
        {signupPolicy ? (
          <>
            <p>문서 버전: {signupPolicy.version}</p>
            <div className={styles.content}>{signupPolicy[kind]}</div>
          </>
        ) : (
          <p>문서를 준비하고 있어요.</p>
        )}
      </article>
    </main>
  )
}
