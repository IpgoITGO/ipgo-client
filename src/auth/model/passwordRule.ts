// 가입 규칙: 8~16자(10/29 박찬 결정 — 서버 PR #35의 최대 10자는 16자로 바꿔 달라고 요청함), 영문 대문자·소문자·숫자·특수기호 각 1개 이상,
// 공백 없는 ASCII(`!`부터 `~`까지)만. 한글·이모지·공백은 안 된다. 화면 검사와 가짜 서버가 함께 쓴다.
export const PASSWORD_RULE =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!-/:-@[-`{-~])[!-~]{8,16}$/

export const PASSWORD_RULE_MESSAGE =
  '8~16자로 영문 대문자·소문자·숫자·특수문자를 모두 넣어 주세요.'

// 조건 목록: 위 규칙을 조건 하나씩 나눈 것. 다 채우면 PASSWORD_RULE도 통과한다.
export const PASSWORD_CHECKS = [
  { label: '8~16자', test: (v: string) => v.length >= 8 && v.length <= 16 },
  { label: '대문자', test: (v: string) => /[A-Z]/.test(v) },
  { label: '소문자', test: (v: string) => /[a-z]/.test(v) },
  { label: '숫자', test: (v: string) => /\d/.test(v) },
  { label: '특수문자', test: (v: string) => /[!-/:-@[-`{-~]/.test(v) },
] as const

// 비밀번호 칸에 들어오면 바로 지울 글자: 규칙(! 부터 ~ 까지 ASCII) 밖의 한글·공백·이모지
export const stripInvalidPasswordChars = (v: string) => v.replace(/[^!-~]/g, '')
