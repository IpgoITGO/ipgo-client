# JWT 인증 명세 대조

2026-11-06 기준 [Server #28](https://github.com/IpgoITGO/ipgo-server/issues/28)의 명세서 갱신 요구사항을 현재 서버 계약과 맞춥니다. 기존 구현의 문서 정정이며 인증 코드나 API 동작을 바꾸지 않습니다.

## 수정한 내용

| 명세서 절 | 이전 설명 | 반영한 계약 |
|---|---|---|
| 1장 인증 | 세션 쿠키/JWT 미확정 | 보호 API는 JWT Bearer, 액세스 기본 15분·로그인 최대 7일 |
| 3.1 로그인 | JSON 입력, 회원 정보 응답 | form-urlencoded 입력, JWT JSON과 리프레시 쿠키; 회원 정보는 `/api/auth/me` |
| 3.1 갱신·로그아웃 | 세부 계약 누락 | `/api/auth/refresh`·`/api/auth/logout`, 쿠키·CSRF·회전·현재 로그인 폐기 |
| 6장 인증 오류 | 만료 시 일괄 로그인 이동 | `ACCESS_TOKEN_EXPIRED`만 갱신 후 1회 재시도, 다른 인증 오류는 재로그인 |
| 7장 확정 사항 | 인증 방식 미확정 체크 | JWT와 쿠키/CSRF 계약 확정 표시 |

명세서의 일반 `/auth/...` 상대 경로 표기는 유지하며, 새로 구체화한 인증 endpoint의 전체 경로는 `/api/auth/...`입니다. 명세서 1장의 일반 기본 경로 `/api/v1`과 다른 기능의 기존 경로를 일괄 개편하는 작업은 포함하지 않습니다. 현재 실제 인증 경로는 서버 README를 기준으로 확인합니다.

## 상세 기준

- 액세스 JWT는 프론트 메모리에 보관하고 보호 API에 Bearer 헤더로 보냅니다. 새로고침 시 CSRF를 받은 뒤 refresh로 복구합니다.
- `ipgo_refresh`는 HttpOnly·배포 시 Secure·SameSite=Lax·Path=/api/auth이며 Domain은 지정하지 않습니다. 서버 DB에는 SHA-256 해시만 저장합니다.
- refresh마다 이전 토큰을 무효화하며 최초 로그인부터 7일인 마감을 연장하지 않습니다. 액세스 JWT도 로그인 마감 이내로 제한돼 마지막에는 `expiresIn`이 900보다 작을 수 있습니다.
- 이전 refresh 재사용은 해당 로그인 전체를 폐기하며 다른 독립 로그인은 유지합니다. 프론트는 동시 갱신을 조율합니다.
- 쿠키를 쓰는 인증 POST는 CSRF가 필요합니다. 보호 Bearer API는 CSRF 헤더를 요구하지 않습니다. refresh/logout은 만료된 Bearer가 있어도 쿠키로 처리하지만 CSRF는 필요합니다.
- `ACCESS_TOKEN_EXPIRED`는 refresh 1회 후 원래 요청 1회 재시도합니다. `INVALID_ACCESS_TOKEN`, `SESSION_REVOKED`, `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_EXPIRED`, `REFRESH_TOKEN_REUSED`는 재로그인합니다. CSRF 누락·오류는 403 `FORBIDDEN`입니다.

## 근거와 검증 범위

- [서버 인증 계약](https://github.com/IpgoITGO/ipgo-server/blob/dev/README.md), [토큰 자동 검사](https://github.com/IpgoITGO/ipgo-server/blob/dev/src/test/java/com/ipgo/server/integration/TokenIntegrationTests.java).
- [#96](https://github.com/IpgoITGO/ipgo-server/issues/96): 11/5 개발 환경의 자연 15분 만료→갱신→원래 API 재호출, refresh 쿠키 유실→로그인 화면, 기존 회전/재사용·로그아웃·CSRF 검증 근거. 7일 refresh 자연 만료 실측과 구분합니다.
- [#75](https://github.com/IpgoITGO/ipgo-server/issues/75): 로컬 JWT 설정·키 오류/기동 검사·기존 인증 회귀 근거.
- 원본 명세서 blob `0becd06277a2e366c2362375e74a555b83104bd8`. 수정 대상은 9개 문단입니다. DOCX ZIP/XML 유효성과 다른 문단·패키지 항목 동일성을 검사했습니다. Word 화면 검수와 새 인증 시험은 실행하지 않았습니다.
- README는 현재 JWT 인증 흐름을 이미 설명하고 있어 이번 문서 정정에서 변경하지 않습니다. 앱·API·DB schema 영향은 없습니다. DOCX는 바이너리이므로 같은 파일을 수정하는 PR과 충돌할 수 있습니다.

이 PR은 검토용이며 #28 종료나 병합·배포를 포함하지 않습니다. 검토 및 dev 반영 여부를 확인한 뒤 #28의 문서 완료 조건을 판단합니다.
