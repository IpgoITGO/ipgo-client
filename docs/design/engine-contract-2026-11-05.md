# API 명세서4장 변경 대조

상태: 공동 검토 대기. Server25 / Client78 / IPGO-60.

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
| 응답 | FastAPI validation/draft/failReason/promptVersion/latencyMs/costUsd. 공개 K4는 AI/FIXED/TABLE_ONLY·단일text 또는null |
| 저장 | result.input_snapshot/run.selection_snapshot·준비된 ai_explanations.request_payload 및versions/reason/cost/latency |
| 실패 | 재시도/DONE·FAILED종결·commit후ACK, 설명 실패는 기본 문장/표시 생략·자동 유료 재호출 없음 |
| 미래 범위 | 서버backtest연결·CUSTOM설명재생성·모델/실제token은 현재 계약 구현 완료로 표시하지 않음 |

DOCX는4장14개 기존 문단과4장 추가8문단을 수정했다. 5장의 K4 호출 시점1문단도 같은 목적에 포함한다.
그 밖의 문단 텍스트와 다른 ZIP 내부 파일의 원본 바이트는 보존 검사를 통과했다.
ZIP/Word XML 구조 검사는 통과했지만 Word/PDF의 시각 렌더링 검사는 수행하지 않았다.
리뷰는 이 Markdown 대조와 DOCX를 함께 사용한다.

Server25의 기존 답변은 Spring 책임으로 합의했으며, AI24에는 정무영 최종 확인이 아직 열린 기록으로 남는다.
이 PR이 그 확인을 대신하지 않는다. 최종 이름·문장 형태·추가 실패 사유는 AI44와 함께 확인한다.

Server의 상세 대조 문서: `docs/decisions/0009-current-insight-scenario-contract.md`.
관련 Server/Client 문서 PR을 Server25와 Client78에 연결한 뒤 공동 검토한다.
Client dev 병합은 개발 배포를 일으킬 수 있으므로 이 PR은 별도 승인 전 병합하지 않는다.
