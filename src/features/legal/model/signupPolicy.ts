export type SignupPolicy = {
  version: string
  terms: string
  privacy: string
  privacyConsent: string
}

// 최종 약관·처리방침·수집 이용 동의서와 서버의 실제 공통 version이 확정되면
// 한 묶음으로 넣는다. 초안이나 예시 version으로 가입 동의를 받지 않는다.
// 준비 전에는 기존 서버 호환 가입을 유지하며 공개 링크·동의 UI를 켜지 않는다.
export const signupPolicy: SignupPolicy | null = null
