# 개발 문서 안내

필요한 문서만 선택해 읽습니다. 공통 규칙은 한곳에만 기록하고 다른 문서에서 링크로 연결합니다.

| 확인할 내용 | 문서 |
|---|---|
| Issue부터 병합까지의 순서 | [작업 흐름](rules/workflow.md) |
| Issue·PR·commit 작성 방식 | [작성 규칙](rules/conventions.md) |
| 비밀값과 위험한 변경 기준 | [안전 규칙](rules/safety.md) |
| Jira·GitHub 동기화와 Vercel 배포 | [자동화 운영](automation.md) |
| 자동화 도입 결과와 확인된 예외 | [2026-10-29 자동화 기준 기록](records/2026-10-29-automation-baseline.md) |
| 요구사항·Jira·GitHub 담당자 정리 결과 | [2026-10-29 담당자 정합성 기록](records/2026-10-29-assignee-reconciliation.md) |
| 화면 시안 (화면 7 · 팝업 4 등 15장) | [UI 시안](design/ui-screens.pdf) |
| API 요청·응답 형식 (10월 23일 기준 **과거 문서**) | [API 명세서](design/api-spec.docx) |

> ⚠️ **API 명세서는 10월 23일 기준의 과거 문서입니다.** 현재 서버(`ipgo-server`)와 다른 점이 많으니, 연동할 때는 서버 README를 먼저 확인합니다.
>
> - 기본 경로는 `/api`입니다 (`/api/v1` 아님).
> - 로그인은 **세션 쿠키 + CSRF 토큰** 방식입니다. 로그인 요청은 form 형식이고 성공하면 204입니다.
> - 비밀번호 규칙은 **8자 이상, 영문+숫자+특수문자**입니다 (서버 반영 예정).
> - 오류 code 이름이 서버 기준으로 바뀌었습니다 (예: `LOGIN_FAILED` → `INVALID_CREDENTIALS`).
> - 명세서를 서버 기준으로 고치는 담당은 팀에서 정하는 중입니다.

애플리케이션 실행 방법과 주요 구조는 루트 [README](../README.md)에 유지합니다.
