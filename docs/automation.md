# Jira·GitHub·Vercel 자동화 운영

이 문서는 자동화의 정본입니다. 도입 당시 검증 결과는
[2026-10-29 자동화 기준 기록](records/2026-10-29-automation-baseline.md)에 분리해 보존합니다.

## 역할과 관리 범위

| 도구 | 정본으로 관리하는 내용 |
|---|---|
| Jira | 작업명, 담당자, 시작일·마감일, 상태, 스프린트 |
| GitHub Issue | 목적, 상세 작업, 완료 조건, 제외 범위, 개발 논의 |
| GitHub Actions | Jira·GitHub 동기화와 병합된 코드의 검증·배포 |
| Vercel | 개발 Preview와 운영 Production |

Jira와 GitHub Issue를 모두 남깁니다. 스프린트 배정, PR 승인과 병합은 사람이 수행하며 자동
승인·자동 병합은 사용하지 않습니다.

## 실행 조건

| GitHub 사건 | 자동화 동작 |
|---|---|
| 10분 주기 또는 수동 실행 | Jira 변경을 GitHub에 반영하고 기간을 대조 |
| Issue 종료·재개 | Jira를 완료·해야 할 일 상태로 전환 |
| Issue 담당자 변경 | Jira 담당자 변경 |
| Issue 신규 댓글 | Jira에 댓글 복제 |
| PR 생성·재개·검토 전환·새 commit | PR에서 찾은 Jira 키를 진행 상태로 전환 |
| `dev` push | 개발 Preview build·배포·고정 alias 연결·smoke test |
| `main` push | Production 후보 build·배포·smoke test·운영 승격·작업 완료 처리 |

PR 자동 승인 또는 자동 병합과 Jira 스프린트 자동 배정은 실행 조건에 포함하지 않습니다.

## Jira·GitHub 동기화

1. 동기화 시작일 이후 생성된 Jira 작업을 조회합니다.
2. 저장소 Issue를 페이지 단위로 읽고 Jira 키로 색인합니다. Jira 작업마다 GitHub Search API를
   호출하지 않습니다.
3. 이미 연결된 작업의 상태·담당자·기간·댓글을 동기화합니다.
4. 미연결 Jira 작업은 별도의 자동 생성 기준 시각 이후에 생성됐을 때만 GitHub Issue와 Jira
   Web link를 만듭니다.
5. 신규 Issue 후보가 실행당 안전 한도를 넘으면 첫 생성 전에 중단합니다.

### 방향별 규칙

| 항목 | Jira → GitHub | GitHub → Jira |
|---|---|---|
| 상태 | 완료면 Issue 종료, 그 외에는 재개 | Issue 종료면 완료, 재개면 해야 할 일 |
| 담당자 | GitHub가 미배정이고 사용자 매핑이 있을 때만 지정 | Jira가 미배정이고 사용자 매핑이 있을 때만 지정 |
| 기간 | 조직 Project의 `시작일`·`마감일` 갱신 | Project에서 한쪽만 바뀌면 Jira 갱신 |
| 댓글 | 신규 텍스트 댓글 복제 | 신규 텍스트 댓글 복제 |

기간을 양쪽에서 동시에 바꾸면 Jira 값을 우선하고 workflow log에 충돌을 남깁니다. 댓글에는
출처 marker를 넣어 자동화가 자기 댓글을 다시 복제하지 않게 합니다. 첨부파일, 멘션, 댓글
수정·삭제는 동기화하지 않습니다.

`.github/jira-github-users.json`에서 Jira `accountId`와 GitHub username을 연결합니다. 담당자를
추가하기 전에 양쪽 계정이 실제 프로젝트와 저장소에 할당 가능한지 확인합니다.

### 담당자 배정과 충돌 규칙

| 작업 영역 | 미배정 작업의 기본 담당자 | GitHub username |
|---|---|---|
| AI | 이석형 | `tjrgud3000-ops` |
| 서버 | 정무영 | `bose9029` |

영역 기본 담당자는 신규·기존 작업의 빈 담당자를 정리할 때 적용하는 triage 기준입니다. 다음
안전 규칙을 우선합니다.

- 이미 담당자가 있으면 영역 기본 담당자로 자동 교체하지 않습니다.
- Jira 또는 GitHub 한쪽이 미배정이거나 계정 매핑이 없다는 이유로 반대쪽 담당자를 지우지
  않습니다.
- 양쪽 담당자가 서로 다르면 workflow log에 충돌을 남기고 자동 변경하지 않습니다.
- `[공통]`, `[연동]`, `[화면]` 작업은 영역과 책임을 확인해 수동 배정합니다.
- 담당자 추가·변경 후에는 Jira와 GitHub 양쪽의 최종 값을 확인합니다.

현재 담당자 정리 결과와 남은 예외는
[2026-10-29 담당자 정합성 기록](records/2026-10-29-assignee-reconciliation.md)에 보존합니다.

## 운영 배포 완료 규칙

운영 workflow는 `main`의 `head_commit.message`에서 Jira 키를 찾아 해당 Jira 작업과 GitHub
Issue를 완료 처리합니다. 표준 merge commit에는 `dev → main` PR 제목이 포함되므로 다음 규칙을
지킵니다.

- `dev → main` PR 제목에 운영 배포 후 완료할 Jira 키를 모두 넣습니다.
- 한 건이면 `[IPGO-77] dev를 main에 반영`처럼 작성합니다.
- 여러 건이면 `[IPGO-73][IPGO-74] dev를 main에 반영`처럼 모두 작성합니다.
- PR 본문에만 적은 키는 merge commit 메시지에 포함되지 않으므로 완료 처리 대상으로 보지
  않습니다.

키가 누락돼도 배포 자체는 성공할 수 있습니다. 이때 GitHub Issue를 수동으로 닫아 Jira 전환
workflow를 실행하거나 Jira를 완료로 바꾼 뒤 정기 동기화가 Issue를 닫는지 확인합니다.

## Vercel 배포

| branch | Vercel 환경 | 고정 주소 |
|---|---|---|
| `dev` | Preview | `https://ipgo-client-dev.vercel.app` |
| `main` | Production | `https://ipgo-client.vercel.app` |

두 workflow 모두 의존성 설치와 `npm run ci:check`를 먼저 실행하고, 고정한 Vercel CLI 버전으로
`vercel pull`과 `vercel build`를 수행합니다.

- 개발: `vercel deploy --prebuilt`로 Preview를 만든 뒤 개발 고정 alias를 연결합니다.
- 운영: `vercel deploy --prebuilt --prod --skip-domain`으로 Production 후보를 만듭니다.
- 운영 후보의 `/`, `/login`, `/dashboard`, `/mockServiceWorker.js`가 정상일 때만
  `vercel promote`로 승격합니다.
- 운영 후보 검증이 실패하면 기존 운영 alias는 유지됩니다.

## GitHub 설정

### Repository Variables

| 이름 | 용도 |
|---|---|
| `VERCEL_ORG_ID` | Vercel Team ID |
| `VERCEL_PROJECT_ID` | Vercel Project ID |
| `VERCEL_CLI_VERSION` | 검토 후 고정한 Vercel CLI 버전 |
| `JIRA_BASE_URL` | Jira Cloud 주소 |
| `JIRA_PROJECT_KEY` | 동기화할 Jira 프로젝트 키 |
| `JIRA_SYNC_CREATED_AFTER` | 기존 연결 작업을 조회할 시작일 (`YYYY-MM-DD`) |
| `JIRA_AUTO_CREATE_AFTER` | 미연결 Issue 자동 생성 기준 시각(ISO 8601) |
| `JIRA_AUTO_CREATE_LIMIT` | 실행 1회당 신규 Issue 안전 한도(미설정 시 5건) |
| `PROJECT_V2_NUMBER` | 기간을 저장하는 조직 Project 번호 |

### Secrets

| 이름 | 용도 |
|---|---|
| `VERCEL_TOKEN` | Vercel CLI 배포 인증 |
| `JIRA_USER_EMAIL` | Jira API 사용자 |
| `JIRA_API_TOKEN` | Jira API 인증 token |
| `PROJECTS_TOKEN` | GitHub Projects read/write 권한의 fine-grained token |

Secret 값은 GitHub 설정 화면에서 직접 입력합니다. 저장소, Issue, PR, 문서, workflow log에는
값을 복사하지 않습니다. `VERCEL_TOKEN`은 Repository Secret 또는 `development`와 `production`
Environment에 각각 등록할 수 있습니다.

## 브랜치 보호

- `dev`: PR과 대화 해결 필수, 승인 수 0건, 자동 병합 금지
- `main`: 작성자 외 팀원 1명 승인과 대화 해결 필수, 새 commit이면 기존 승인 무효화
- 공통: 직접 push, force push, 관리자 우회와 branch 삭제 금지

## 변경 전 확인

1. Jira 후보 수와 GitHub 연결 수를 읽기 방식으로 확인합니다.
2. `JIRA_AUTO_CREATE_AFTER`와 `JIRA_AUTO_CREATE_LIMIT`가 의도한 범위인지 확인합니다.
3. 배포 대상 Team·Project·branch·commit과 environment를 확인합니다.
4. Secret은 이름과 등록 여부만 확인하고 값을 출력하지 않습니다.
5. 운영 배포라면 사용자 영향, 검증 결과와 rollback 대상을 확인합니다.

과거 작업을 일괄 생성할 때는 후보 수를 검토한 뒤에만 기준 시각과 한도를 조정합니다.

## 검증

로컬 변경은 다음 명령으로 확인합니다.

```bash
npm ci
npm run ci:check
VITE_ENABLE_MSW=true npm run build
```

설정 후 확인 순서는 다음과 같습니다.

1. `Jira GitHub 동기화`를 수동 실행하고 신규 생성 수·중복·실패를 확인합니다.
2. Jira 댓글 하나와 GitHub 댓글 하나가 각각 반대쪽에 한 번만 생기는지 확인합니다.
3. `dev` 병합 후 개발 workflow, Vercel 상태와 네 smoke 경로를 확인합니다.
4. 승인된 `dev → main` PR 병합 후 운영 후보 검증과 승격을 확인합니다.
5. PR 제목의 Jira 작업과 GitHub Issue가 완료됐는지 확인합니다.

배포 workflow는 branch 병합으로만 실행합니다.

## 장애와 복구

| 상황 | 조치 |
|---|---|
| 개발 alias 오류 | 마지막 정상 Preview에 `ipgo-client-dev.vercel.app` alias를 다시 연결 |
| 운영 오류 | 정상 Production deployment를 `vercel rollback` 또는 다시 promote |
| 동기화 대량 생성 위험 | workflow 비활성화 → 양쪽 기록 대조 → 기준 시각·한도 수정 → 수동 실행 |
| 기간 충돌 | Jira 시작일·마감일을 정리한 뒤 workflow 재실행 |
| 운영 완료 키 누락 | GitHub Issue를 닫아 Jira event 동기화하거나 Jira 완료 후 poll 확인 |

rollback은 새 운영 push의 자동 alias 연결에 영향을 줄 수 있으므로 복구 후 정상 deployment를
명시적으로 promote하고 다음 배포가 실제 운영 주소에 연결되는지 확인합니다.
