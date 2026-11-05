# API 명세서4장 변경 대조

상태: 서버 담당 인수 검토 완료, 공동 계약·문서 반영 대기. Server25 / Client78 / IPGO-60.

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
추가 필드·null·알 수 없는 사유 처리 기준을 함께 반영한다. 실제 배포 후 화면 확인과 AI44의
전체 연동 시험은 이번 문서/로컬 검사 성공과 구분하며 공동 작업 완료를 대신하지 않는다.

Server의 상세 대조 문서: `docs/decisions/0009-current-insight-scenario-contract.md`.
관련 Server/Client 문서 PR을 Server25와 Client78에 연결한 뒤 공동 검토한다.
Client dev 병합은 개발 배포를 일으킬 수 있으므로 이 PR은 별도 승인 전 병합하지 않는다.
