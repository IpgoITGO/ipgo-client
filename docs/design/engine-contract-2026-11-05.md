# API 명세서4장 변경 대조

상태: **서버 계약 확정·API 명세 dev 반영 완료**. Server25 / Client78 / IPGO-60.
Client78 전체 화면/시나리오 분기 검증은 이 계약 문서의 완료와 구분한다.

문서만 수정하며 Client 요청 코드·화면·계산 정책은 바꾸지 않는다.
기준 Server b66bc8a·AI 27a0063의 구현과 기존 담당자 합의를 대조한 반영안이다.

| 명세 항목 | 이번 반영 |
|---|---|
| 정제·계산 전송 | HTTP 단일 호출 표기에서 현행 Spring outbox/SQS 경로와 envelope로 구분 |
| CLEAN | 파일1개·previousUploadFileId·files payload, 재전송20분/서버만료2시간 |
| CALCULATE | uploadFileIds/policy/settings/plannedReceipts/noDateReceipts, 재전송5분/서버만료15분 |
| 직접 수량 | 내부 HTTP /engine/scenarios와 공개 POST {qty}/201·단일CUSTOM, 원래 입력/소스·권한·단위 올림 |
| 설명 생성 시점 | 계산 commit 이후 승인된 작업이 생성·저장하며 K4 GET은 조회 |
| 값 치환/검사/대체 | Spring이 계산 표시값 대입·대조·기본 문장, FastAPI가 초안 형식 검사 |
| 응답 | FastAPI validation/draft/failReason/promptVersion/latencyMs/costUsd. 공개 K4는 AI/FIXED/TABLE_ONLY·단일text 또는null 및 이번 PR에서 추가하는 failReason |
| 저장 | result.input_snapshot/run.selection_snapshot·준비된 ai_explanations.request_payload 및versions/reason/cost/latency |
| 실패 | 재시도/DONE·FAILED종결·commit후ACK, 설명 실패는 기본 문장/표시 생략·자동 유료 재호출 없음 |
| 미래 범위 | 서버backtest연결·CUSTOM설명재생성·모델/실제token은 현재 계약 구현 완료로 표시하지 않음 |

DOCX는 K4 공개응답3문단·4장13문단·5장 생성시점1문단(기존17개)과4장 추가8문단을 수정했다.
K4 예시의 공개되지 않는 reasonCode/values를 제거하고 generatedAt·202/200·text=null 가능성을 명시했다.
그 밖의 문단 텍스트와 다른 ZIP 내부 파일의 원본 바이트는 보존 검사를 통과했다.
ZIP/Word XML 구조 검사는 통과했지만 Word/PDF의 시각 렌더링 검사는 수행하지 않았다.
리뷰는 이 Markdown 대조와 DOCX를 함께 사용한다.

Server25의 기존 답변은 Spring 책임으로 합의했다. 2026-11-05 사용자 지시로 정무영의 서버 계약 검토 역할을
EHWIYA가 인수했고, Codex가 현재 서버 DTO·Client 변환·AI44 시험표를 대조해 서버 검토를 기록했다.
이 기록을 기존 담당자나 AI/Client 담당자의 새 승인으로 해석하지 않는다.

공개 K4는 text 단일 문자열/null이며 Client가 줄 단위 sentences로 변환한다. 사용자는 2026-11-05
안전한 failReason 추가를 선택했다. 이번 Server PR124는 실패 대체일 때 LLM_ERROR/LLM_TIMEOUT/
VALIDATION_FAILED/VALUE_MISMATCH/LLM_NOT_CONFIGURED/INVALID_INPUT/INPUT_UNAVAILABLE 중 하나를
반환한다. 알 수 없는 내부 사유는 LLM_ERROR로 축약하고 정상·비활성·상태별 고정 문장은 null이다.
DB 원래 reason_code와 원문 오류는 공개하지 않는다. reasonCode/values도 공개 필드가 아니다.

기존 b66bc8a 배포에는 새 failReason이 없다. 새 서버 응답은 기존 Client의 failText가
아는 세 코드에 개별 안내, 나머지 코드에 공통 안내를 표시하도록 연결된다. API 명세 DOCX에도
추가 필드·null·알 수 없는 사유 처리 기준을 반영했고 PR229로 dev에 병합했다. 실제 배포 후 화면 확인과 AI44의
전체 연동 시험은 이번 문서/로컬 검사 성공과 구분하며 공동 작업 완료를 대신하지 않는다.

Server의 상세 대조 문서: `docs/decisions/0009-current-insight-scenario-contract.md`.
Server PR124·Client PR229를 Server25/AI24/44·Client78에 연결하고 사용자 인수·실패 코드 선택과 검증을 기록했다. Server25는 완료 근거를 남겨 종료했다.
이번 완료 기록은 사용자가 승인한 개발 반영의 결과다. Production·실제 유료 호출을 승인한 것으로 해석하지 않는다.

## 최종 반영과 검증 범위

- 실제 검증한 Server320014f/TD20·Clientffcf8e8는 개발 배포와 소스 대조를 마쳤다. 이후 이 문서 전용 commit을 새 앱 런타임 실측으로 세지 않는다.
- K4 최신 결과5건·과거AI설명5건·비활성698은 실제 API에서 failReason=null과 기존 mode/text를 확인했고, SKU32/result1958의 현재 TABLE_ONLY 화면과 같은 결과를 대조했다. 비null 허용 사유/미지 사유 축약은 로컬 서버 API 경계 및 Client 변환 검사 근거다. 새 실제 유료 호출은 없다.
- 사용자가 확정한 현행 SQS C2는 응답 전까지 QUEUED, 종결 시 DONE/FAILED다. RUNNING은 기존 응답의 호환 수용 값이며 새 진행 이벤트를 발행하지 않는다. DOCX의 허용 상태 목록을 모든 경로에서의 필수 전이로 해석하지 않는다.
- 실제 run88의 908.9초 만료·실패 화면, AI 복구 후 이전 run28/조건/결과 보존을 Server95와 PR126에 기록했다. 과거 DLQ36은 유지했다. 기존 RUNNING 화면 검사는 합성 출처다.
- API 명세 DOCX는 기존 반영 원본 그대로이며 이 후속은 README/Markdown의 과거 대기 표시만 정리한다. AI44 전체 시험·Client78 전체 분기를 완료 처리하지 않는다.
