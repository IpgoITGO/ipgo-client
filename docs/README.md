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
| API 명세 (4장/설명 생성 시점은 11/5 공동 검토안, 나머지는 과거 범위 확인 필요) | [API 명세서](design/api-spec.docx) |
| 4장 변경 내용·실제 구현과 검토 잔여 | [엔진 계약 대조](design/engine-contract-2026-11-05.md) |

> API 명세서 전체의 현재화를 보증하지 않습니다. 이번에는 Server25 범위의 4장과 설명 생성 시점을
> 실제 구현에 맞춰 공동 검토안으로 반영했습니다. 인증·비밀번호·나머지 API는 현재 Server README와
> 구현 계약을 먼저 확인합니다. 과거의 세션 로그인204 안내를 현재 JWT 계약으로 사용하지 않습니다.

애플리케이션 실행 방법과 주요 구조는 루트 [README](../README.md)에 유지합니다.
