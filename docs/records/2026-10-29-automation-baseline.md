# 2026-10-29 자동화 기준 기록

이 문서는 Jira·GitHub 동기화와 Vercel CI/CD를 도입하고 실제 환경에서 확인한 결과를 보존합니다.
현재 운영 규칙과 복구 절차는 [자동화 운영](../automation.md)을 따릅니다. 시각은 KST 기준입니다.

## 도입 변경

| 변경 | 결과 |
|---|---|
| PR #48 | Jira·GitHub 동기화와 `dev`·`main` Vercel workflow 도입 |
| PR #99 | 신규 Issue 자동 생성 기준 시각과 실행당 5건 기본 안전 한도 추가 |
| PR #100 | GitHub Search API 반복 호출을 저장소 Issue 목록 조회와 Jira 키 색인으로 교체 |

## 동기화 기준

2026-10-28 최종 수동 검증에서 다음을 확인했습니다.

- Jira 작업 48건과 Jira 키가 있는 GitHub Issue 48건 연결
- 누락 0건, 중복 0건
- 누락됐던 `IPGO-80`~`IPGO-83`은 GitHub Issue #101~#104로 제한 생성
- Jira → GitHub 댓글과 GitHub → Jira 댓글을 각각 실제로 복제
- 최종 재실행에서 추가 Issue와 중복 댓글이 생기지 않음

2026-10-29 10:02~10:03 정기 동기화와 관련 GitHub event workflow도 성공했습니다.

- [정기 동기화 실행 #40797955422](https://github.com/IpgoITGO/ipgo-client/actions/runs/40797955422)

## 배포 기준

| 환경 | branch·commit | 확인 결과 | Actions |
|---|---|---|---|
| 개발 | `dev` · `bf427f2` | Vercel `READY` | [#40797833658](https://github.com/IpgoITGO/ipgo-client/actions/runs/40797833658) |
| 운영 | `main` · `056b954` | Production 후보 검증과 승격 성공, Vercel `READY` | [#40797751456](https://github.com/IpgoITGO/ipgo-client/actions/runs/40797751456) |

- 개발 주소: `https://ipgo-client-dev.vercel.app`
- 운영 주소: `https://ipgo-client.vercel.app`
- 확인 경로: `/`, `/login`, `/dashboard`, `/mockServiceWorker.js`

## 확인된 예외

운영 배포는 성공했지만 PR #53 제목과 merge commit 메시지에 `IPGO-77`이 없어서 Jira
`IPGO-77`은 `검토 중`, GitHub Issue #47은 열린 상태로 남았습니다. 이는 동기화 장애가 아니라
운영 완료 대상 키를 찾지 못한 결과입니다.

재발 방지를 위해 다음 규칙을 문서와 PR 템플릿에 반영했습니다.

- `dev → main` PR 제목에 운영 배포 후 완료할 Jira 키를 모두 포함
- 운영 배포 후 Jira 상태와 GitHub Issue 종료를 별도로 확인
- 키 누락 시 GitHub Issue 종료 event 또는 Jira 완료 후 정기 동기화로 복구

이 기록에는 Secret 값과 로컬 `.env` 내용을 포함하지 않습니다.
