import { ApiError } from '../../shared/api/client'

export const EMAIL_EXISTS_MESSAGE = '이미 가입한 이메일이에요.'
export const EMAIL_VERIFICATION_REQUIRED_MESSAGE =
  '이메일 인증을 먼저 해 주세요.'
export const GENERIC_ERROR =
  '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'

// ipgo-server의 오류 code별 안내 문구. API 명세서와 달라진 이름은 서버를 따릅니다.
// 나머지 code는 서버가 준 message를 그대로 보여줍니다.
const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 맞지 않아요.',
  DUPLICATE_EMAIL: EMAIL_EXISTS_MESSAGE,
  INVALID_EMAIL_CODE: '코드가 맞지 않아요. 5번 틀리면 코드를 다시 받아야 해요.',
  EMAIL_CODE_EXPIRED: '시간이 지났어요. 코드를 다시 받아 주세요.',
  INVALID_VERIFICATION_TOKEN:
    '이메일 인증이 만료되었거나 맞지 않아요. 이메일 인증을 다시 해 주세요.',
  EMAIL_VERIFICATION_RATE_LIMITED:
    '인증 메일은 1분에 한 번 보낼 수 있어요. 잠시 후 다시 눌러 주세요.',
  EMAIL_DELIVERY_UNAVAILABLE:
    '인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
}

export function messageOf(error: unknown) {
  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? error.message
  }

  return GENERIC_ERROR
}
