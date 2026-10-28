# Jira·GitHub·Vercel 자동화

## 역할

| 도구 | 기록 범위 |
|---|---|
| Jira | 작업명, 담당자, 시작일·마감일, 상태, 스프린트 |
| GitHub Issue | 목적, 상세 작업, 완료 조건, 제외 범위, 개발 논의 |
| GitHub Actions | 동기화 검사와 승인 후 병합된 코드의 배포 |
| Vercel | 개발 Preview와 운영 Production 제공 |

스프린트는 계획 회의에서 수동으로 배정합니다. PR 승인과 병합도 사람이 수행합니다.

## 동기화 흐름

1. GitHub Actions가 10분마다 동기화 시작일 이후 생성된 Jira 작업을 조회합니다.
2. 기존 GitHub Issue는 계속 동기화하고, 미연결 Jira 작업은 별도의 자동 생성 기준 시각 이후에
   생성된 경우에만 상세 Issue와 Jira Web link를 만듭니다.
3. 한 번에 자동 생성할 수 있는 Issue 수를 제한하며, 후보가 한도를 넘으면 생성 전에 중단합니다.
4. Jira 상태·담당자·기간을 GitHub에 반영합니다.
5. GitHub Issue 종료·재개와 담당자 변경은 Jira에 반영합니다.
6. 신규 텍스트 댓글은 양방향으로 복제합니다. 첨부파일, 멘션, 수정·삭제는 동기화하지 않습니다.

댓글에는 출처 marker를 넣어 자동화가 자기 댓글을 다시 복제하지 않게 합니다. 기간을 양쪽에서
동시에 바꾸면 Jira 값을 우선하고 workflow log에 충돌을 남깁니다.

## 배포 흐름

| 병합 대상 | Vercel 환경 | 고정 주소 |
|---|---|---|
| `dev` | Preview | `https://ipgo-client-dev.vercel.app` |
| `main` | Production | `https://ipgo-client.vercel.app` |

`main` 배포는 Production 후보를 먼저 만들고 `/`, `/login`, `/dashboard`,
`/mockServiceWorker.js`를 확인한 뒤 승격합니다. 확인 실패 시 기존 운영 alias는 유지됩니다.

## GitHub 설정

Repository Variables:

| 이름 | 용도 |
|---|---|
| `VERCEL_ORG_ID` | Vercel Team ID |
| `VERCEL_PROJECT_ID` | Vercel Project ID |
| `VERCEL_CLI_VERSION` | 고정한 Vercel CLI 버전 |
| `JIRA_BASE_URL` | Jira Cloud 주소 |
| `JIRA_PROJECT_KEY` | 동기화할 Jira 프로젝트 키 |
| `JIRA_SYNC_CREATED_AFTER` | 상태·댓글·담당자·기간 동기화 조회 시작일 (`YYYY-MM-DD`) |
| `JIRA_AUTO_CREATE_AFTER` | 미연결 GitHub Issue 자동 생성 기준 시각(ISO 8601, 예: `2026-10-28T18:11:00+09:00`) |
| `JIRA_AUTO_CREATE_LIMIT` | 실행 1회당 신규 Issue 안전 한도(미설정 시 5건) |
| `PROJECT_V2_NUMBER` | 기간을 저장하는 조직 Project 번호 |

Secrets:

| 이름 | 용도 |
|---|---|
| `VERCEL_TOKEN` | Vercel CLI 배포 인증 |
| `JIRA_USER_EMAIL` | Jira API 사용자 |
| `JIRA_API_TOKEN` | Jira API 인증 token |
| `PROJECTS_TOKEN` | GitHub Projects read/write 권한의 fine-grained token |

`JIRA_USER_EMAIL`, `JIRA_API_TOKEN`, `PROJECTS_TOKEN`은 Repository Secret으로 등록합니다.
`VERCEL_TOKEN`은 Repository Secret 또는 `development`와 `production` Environment에 각각
등록합니다. Secret 값은 GitHub 설정 화면에서 직접 입력하고 저장소, Issue, PR, workflow log에
복사하지 않습니다.

`dev`는 PR과 대화 해결을 필수로 하되 승인 건수는 요구하지 않습니다. `main`은 작성자 외 팀원
1명의 승인과 대화 해결 후에만 병합합니다. 자동 승인과 자동 병합은 설정하지 않습니다.

## 사용자 매핑

`.github/jira-github-users.json`에서 Jira `accountId`와 GitHub username을 연결합니다. 담당자를
추가하기 전에 양쪽 계정이 실제 프로젝트와 저장소에 할당 가능한지 확인합니다.

## 검증

```bash
npm ci
npm run ci:check
VITE_ENABLE_MSW=true npm run build
```

Secrets를 설정한 뒤 `Jira GitHub 동기화` workflow를 수동 실행하여 연결을 확인합니다. 배포
workflow는 브랜치 병합으로만 실행합니다.

첫 실행 전 `JIRA_AUTO_CREATE_AFTER`를 현재 시각으로 설정하고, Jira JQL로 생성 후보가 안전
한도 이내인지 확인합니다. 과거 작업을 일괄 생성하려면 후보 수를 먼저 검토한 뒤에만 기준 시각과
한도를 조정합니다.

## 복구

- 개발 alias 오류: 마지막 정상 Preview에 `ipgo-client-dev.vercel.app` alias를 다시 연결합니다.
- 운영 오류: `vercel rollback <정상-deployment-id>` 또는 정상 배포를 다시 promote합니다.
- 동기화 오류: `Jira GitHub 동기화` workflow를 비활성화하고 양쪽 기록을 확인합니다.
- 기간 충돌: Jira 시작일·마감일을 기준으로 정리한 뒤 workflow를 다시 실행합니다.
