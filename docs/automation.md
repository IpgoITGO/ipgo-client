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

1. GitHub Actions가 10분마다 설정일 이후 생성된 Jira 작업을 조회합니다.
2. 제목에 Jira 키가 있는 GitHub Issue가 없으면 상세 Issue를 만들고 Jira Web link를 추가합니다.
3. Jira 상태·담당자·기간을 GitHub에 반영합니다.
4. GitHub Issue 종료·재개와 담당자 변경은 Jira에 반영합니다.
5. 신규 텍스트 댓글은 양방향으로 복제합니다. 첨부파일, 멘션, 수정·삭제는 동기화하지 않습니다.

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
| `JIRA_SYNC_CREATED_AFTER` | 자동 생성 적용 시작일 (`YYYY-MM-DD`) |
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

`dev`와 `main`은 PR 승인 1건과 대화 해결 후에만 병합합니다. 자동 승인과 자동 병합은 설정하지
않습니다.

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

## 복구

- 개발 alias 오류: 마지막 정상 Preview에 `ipgo-client-dev.vercel.app` alias를 다시 연결합니다.
- 운영 오류: `vercel rollback <정상-deployment-id>` 또는 정상 배포를 다시 promote합니다.
- 동기화 오류: `Jira GitHub 동기화` workflow를 비활성화하고 양쪽 기록을 확인합니다.
- 기간 충돌: Jira 시작일·마감일을 기준으로 정리한 뒤 workflow를 다시 실행합니다.
