import { ApiError } from '../../shared/api/client'

export const EMAIL_EXISTS_MESSAGE = '이미 가입한 이메일이에요.'
export const EMAIL_VERIFICATION_REQUIRED_MESSAGE =
  '이메일 인증을 먼저 해 주세요.'
export const GENERIC_ERROR =
  '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'

// docs/design/api-spec.docx 6장 오류 code별 안내 문구.
// 나머지 code는 서버가 준 message를 그대로 보여줍니다.
const MESSAGES: Record<string, string> = {
  EMAIL_EXISTS: EMAIL_EXISTS_MESSAGE,
  TOO_MANY_REQUESTS:
    '인증 메일은 1분에 한 번 보낼 수 있어요. 잠시 후 다시 눌러 주세요.',
  VERIFICATION_EXPIRED: '시간이 지났어요. 코드를 다시 받아 주세요.',
  VERIFICATION_REQUIRED: EMAIL_VERIFICATION_REQUIRED_MESSAGE,
}

export function messageOf(error: unknown) {
  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? error.message
  }

  return GENERIC_ERROR
}
