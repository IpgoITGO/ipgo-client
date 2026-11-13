export const BUSINESS_REGISTRATION_REQUIRED = '사업자등록번호를 입력해 주세요.'
export const BUSINESS_REGISTRATION_INVALID =
  '사업자등록번호를 다시 확인해 주세요.'

// 숫자 10자리의 검증 숫자만 확인한다. 사업자 존재·영업 상태를 조회하는 검사가 아니다.
// 계산 대조: Microsoft Presidio KrBrnRecognizer._validate_checksum
export function isBusinessRegistrationNumber(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{10}$/.test(value)) return false
  const digits = [...value].map(Number)
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5]
  const sum = weights.reduce(
    (total, weight, i) => total + digits[i] * weight,
    0,
  )
  const check = (10 - ((sum + Math.floor((digits[8] * 5) / 10)) % 10)) % 10
  return check === digits[9]
}
