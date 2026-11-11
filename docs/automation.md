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
| `dev` PR·push | 코드 검사·테스트·build만 실행 (배포 없음) |
| 개발 workflow 수동 실행 | 승인한 `expected_sha`가 dev 실행 SHA와 같을 때만 Preview 배포·alias·smoke test |
| `main` push | Production 후보 build·배포·smoke test·운영 승격·작업 완료 처리 |

PR 자동 승인 또는 자동 병합과 Jira 스프린트 자동 배정은 실행 조건에 포함하지 않습니다.

## Jira·GitHub 동기화

1. 동기화 시작일 이후 생성된 Jira 작업을 마지막 페이지까지 조회합니다.
2. 저장소 Issue를 페이지 단위로 읽고 Jira 키로 색인합니다. Jira 작업마다 GitHub Search API를
   호출하지 않습니다.
3. Jira 전용 키·제외 Issue·참조 정본을 먼저 걸러낸 뒤, 이 저장소의 동기화 정본만
   상태·담당자·기간·댓글을 갱신합니다. 다른 저장소 작업과 과거 미러를 자동 이동·삭제하지 않습니다.
4. 미연결 작업은 `.github/jira-github-routing.json`의 저장소 분류를 적용합니다. 현재 저장소
   대상이면서 자동 생성 기준 시각 이후에 생성된 작업만 GitHub Issue와 Jira Web link를 만듭니다.
5. 현재 저장소의 신규 후보가 실행당 안전 한도를 넘으면 신규 생성 전체만 보류합니다. 기존
   연결 작업은 계속 갱신하며, Actions에는 경고와 보류 대상 키·처리 건수를 남깁니다.
   이 경우 실행은 성공할 수 있지만 신규 작업까지 동기화가 끝났다는 뜻은 아닙니다.

### 신규 작업의 저장소 분류

| Jira 작업명 앞부분               | 신규 Issue 목적지                          |
| -------------------------------- | ------------------------------------------ |
| `[화면]`                         | `IpgoITGO/ipgo-client`                     |
| `[서버]`, `[BE]`                 | `IpgoITGO/ipgo-server`                     |
| `[AI]`, `[AI·DB]`, `[AI worker]` | `IpgoITGO/ipgo-ai`                         |
| `[인프라]`                       | `IpgoITGO/ipgo-infra`                      |
| 공통·통합·결정 등 그 밖의 작업   | 담당 저장소를 확인할 때까지 신규 생성 보류 |

`issueRepositories`에 Jira 키와 저장소를 적으면 위 분류보다 우선합니다. `null`을 적으면 해당
작업의 신규 생성을 보류합니다. IPGO-30은 [인증] 접두사지만 실제 Client #32 작업이므로 Client를 명시합니다.
IPGO-77은 기존 Client #47, IPGO-98은 기존 AI #24
연결을 근거로 목적지를 명시했습니다. IPGO-111은 아래 Jira 전용 규칙을 따릅니다. IPGO-98의 협의 기록은 AI에
유지하고 실제 Spring 구현은 Server #25에서 추적합니다. 서로 다른 저장소로 중복 분류되면
자동 생성하지 않습니다.

**클라이언트 workflow는 클라이언트에만 씁니다.** 다른 저장소 대상은 목적지를 로그에 남기고
제외합니다. 서버·AI·인프라에 새 자동화를 설치하거나 쓰기 권한을 확대하지 않습니다. 다른
저장소의 신규 생성·양방향 동기화는 해당 저장소의 연결·권한·운영 절차를 별도로 확인해야 합니다.

기존 연결은 Issue 제목의 프로젝트 키를 기준으로 판정합니다. Issue 본문의 참고 키만으로
상태·담당자·댓글을 변경하지 않습니다. 제목에 키가 없는 기존 Issue를 연결하려면 중복 여부를
대조한 뒤 제목에 키를 명시합니다. PR과 운영 완료 경로도 `JIRA_PROJECT_KEY`의 키만 처리하므로
`SHA-256`이나 다른 프로젝트 키를 Jira 전환 대상으로 삼지 않습니다.

### 정본·제외·Jira 전용 설정

`.github/jira-github-routing.json`의 다음 설정은 **신규 생성뿐 아니라 기존 연결과 모든 쓰기 경로**에 적용합니다.

- `jiraOnlyKeys`: 회의·일정·전체 계획을 Jira에서만 추적합니다. IPGO-39~45, 47~55, 111은
  GitHub 생성·재오픈·Jira 상태/담당/댓글 갱신에서 제외합니다. 미러를 닫아도 업무 완료가 아닙니다.
- `excludedIssues`: 저장소와 Issue 번호로 과거 미러·이관 전 위치를 지정합니다.
  색인 전부터 제외하며 이 번호만 남아 있어도 대체 Issue를 자동 생성하지 않습니다.
- `canonicalIssues`: Jira 키마다 저장소와 `number` 또는 `nodeId`, `mode`를 지정합니다.
  `reference`는 원본 위치만 알려 주고 자동 생성·상태·담당·기간·댓글 쓰기는 하지 않습니다.
  `sync`는 명시한 한 Issue만 동기화하며 원본이 없으면 새 Issue를 만들지 않고 보류합니다.
  제목·본문을 보고 참조 정본을 자동으로 `sync`로 승격하지 않습니다.

이번 24개 정본은 모두 `reference`입니다. 기존 개발 원본, 다른 저장소의 구현 이슈,
상태 불일치 검토 대상과 오래된 중복 이력을 연결하되 기존 담당·상태를 갑자기 덮어쓰지 않습니다.
이관할 Client #83/#84/#86은 미래 번호를 예측하지 않고 node id로 연결했습니다.
실제 이관 후 새 URL·번호·node id·담당·댓글을 확인해야 하며, 확인 전까지 참조 상태를 유지합니다.
Server #25의 계약 논의와 이관된 실제 구현은 역할이 다릅니다.
Client #58의 세 저장소 공통 규칙은 IPGO-46의 진행 상태를 대신 완료하지 않도록 참조로 보존합니다.
그 밖에도 현재 저장소 목적지를 확인할 수 없는 공통 작업은 기존 연결이 있더라도 쓰지 않습니다.

PR은 제목·branch의 Jira 키만 읽으며 본문의 참고 키는 상태를 바꾸지 않습니다.
유일한 동기화 정본이 있을 때만 처리하고, 완료된 Jira를 후속 PR 때문에 진행 중으로 되돌리지 않습니다.
운영 완료는 commit 첫 줄 또는 GitHub merge commit의 PR 제목만 읽습니다. 그 외 본문 참고 키는 제외합니다.
정본이 없거나 제외·참조 대상이면 Jira 완료도 수행하지 않습니다.
이관된 옛 URL의 redirect를 따라 다른 저장소에 쓰지 않도록 GitHub 요청은 redirect를 거부합니다.

정리 순서는 **보호 코드 검증·반영 → 실제 적용 SHA 확인 → 원본 이관 → 정본 확인 → 미러 종료**입니다.
현재 workflow는 기본 브랜치 코드를 checkout하므로 새 PR을 열 때도 옛 로직이 동작할 수 있습니다.
첫 보호 코드 반영은 동기화 workflow의 상태·실행 중인 run을 보관한 뒤 승인 범위에서 잠시 비활성화하고,
옛 run이 끝났는지 확인한 후 진행합니다. dev 반영 SHA·정본/제외 설정을 확인하고 workflow를 재개한 뒤
보호된 버전으로만 정리를 수행합니다. 그동안 Jira·GitHub의 수동 변경을 함께 관측합니다.
dev 병합은 기존 Vercel 개발 배포도 자동으로 시작할 수 있습니다. 앱 코드·main 운영 배포 변경은 이 정리에 포함하지 않습니다.
Client #85/#101/#102/#103/#107은 기존 Server 원본을 연결하고, Client #59~67과 AI #42는
Jira에서 계속 추적한다는 근거를 남긴 뒤 `not_planned`로 종료합니다. Jira를 완료로 바꾸지 않습니다.
실제 이관·종료는 대상·원문·댓글·담당을 보관하고 승인한 범위에서만 수행합니다.
이 설정을 되돌리면 과거 미러가 다시 동기화될 수 있으므로, 코드 rollback 전에 상태 전환 이벤트와
미러 재오픈·재생성 경로를 별도로 차단해야 합니다. 이슈·댓글을 삭제하는 복구는 하지 않습니다.

### 한도 초과 뒤 정리 순서

1. 경고에 나온 신규 후보를 기존 Issue·PR과 대조합니다. 이미 구현·추적 중인 작업은 새 Issue를
   만들기보다 기존 Issue에 올바른 Jira 키를 연결합니다.
2. 공통 작업의 목적지를 `issueRepositories`에 명시하고, 다른 저장소 작업은 해당 저장소에서
   연결 여부를 확인합니다. 담당 저장소가 불명확하면 보류를 유지합니다.
3. 남은 신규 후보와 생성 영향을 확인한 뒤 한도 조정 또는 나누어 등록할 방법을 승인받습니다.
   한도를 올리는 것만으로 대량 생성 경고를 없애지 않습니다.
4. 승인 후 실제 실행에서 기존 연결 갱신·신규 생성·보류 건수와 양쪽 최종 값을 확인합니다.

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
| `JIRA_AUTO_CREATE_LIMIT`  | 현재 저장소의 실행 1회당 신규 Issue 안전 한도(미설정 시 5건). 초과 시 신규 생성만 보류 |
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
| 신규 생성 한도 초과 경고     | 기존 연결 갱신 결과와 보류 키 확인 → 저장소 분류·기존 Issue 연결 대조 → 승인 후 신규 생성 재개 |
| 잘못된 대상 쓰기·동기화 오류 | workflow 비활성화 → 양쪽 기록 대조 → 설정·코드 수정과 로컬 검증 → 승인 후 수동 실행            |
| 기간 충돌 | Jira 시작일·마감일을 정리한 뒤 workflow 재실행 |
| 운영 완료 키 누락 | GitHub Issue를 닫아 Jira event 동기화하거나 Jira 완료 후 poll 확인 |

rollback은 새 운영 push의 자동 alias 연결에 영향을 줄 수 있으므로 복구 후 정상 deployment를
명시적으로 promote하고 다음 배포가 실제 운영 주소에 연결되는지 확인합니다.

## 개발 배포 승인

### 중복 빌드 줄이기

PR/dev push는 기존 `npm ci`·전체 `ci:check`·`npm run build` 검사를 유지한다.
승인된 dev의 수동 배포는 `verify-source-ci.mjs`로 정확한 SHA의 최신 dev push CI 증거를 검증한다.
같은 workflow·저장소·branch·성공한 최신 attempt의 `verify`와 필수 npm 설치/전체 검사/빌드 step이 모두 성공해야 한다.
목록·job 누락, CI 실패/진행 중, PR CI, 다른 SHA, 확인 중 rerun이 시작되면 중단한다.
증거가 없다고 검사 없이 배포하거나 자동으로 재실행하지 않는다. 이 확인 뒤에만 수동 배포의 `npm ci`·`ci:check`·일반 빌드를 생략한다.
환경 승인을 받은 `deploy`가 Preview 환경을 가져와 `VITE_ENABLE_MSW=false npm run build`를
`vercel build`로 한 번 수행하고 그 결과를 `vercel deploy --prebuilt`로 게시한다.
빌드 실패 시 게시/alias 변경으로 넘어가지 않는다. PR의 환경과 Preview 환경이 같다고 가정해
PR `dist`를 배포에 재사용하지 않는다. 승인 SHA·도메인·환경·CLI 버전·smoke/복구 검사는 유지한다.
dev가 아닌 수동 실행도 일반 빌드 검사는 생략하지 않으며 실제 배포는 기존 조건으로 차단한다.
최신 성공 CI를 읽기 위해 GitHub token에는 `actions: read`만 추가한다. 배포 job의 의존성 설치·환경/SHA·Preview 빌드·alias·smoke 검사는 그대로다.
총 배포 시간에는 준비·CI 증거 조회·승인 대기·최종 Vercel 빌드/게시·smoke/기록을 포함한다.
이번 변경만으로 실제 시간 단축이나 총 10분대 달성을 검증했다고 보고하지 않는다.

### 기존 승인 경계

`Vercel 개발 배포` workflow는 PR/dev push에서 `verify`만 실행합니다. 배포는 dev에서
`workflow_dispatch`로 승인된 전체 SHA를 `expected_sha`에 넣어 실행합니다. 실행 SHA와 다르거나
dev가 아니면 Vercel API 호출 전에 중단합니다. 새 commit으로 승인 SHA를 임의 교체하지 않습니다.

`vercel.json`의 `git.deploymentEnabled=false`로 Git 연동 자동 배포도 차단합니다.
[공식 Git 설정](https://vercel.com/docs/project-configuration/git-configuration)을 따르며
기존 Production Actions는 유지합니다. 검증만 요청받은 작업에서는 수동 배포를 실행하지 않습니다.

복구는 이전 배포 URL과 두 개발 alias를 사전에 기록하고, 승인 후 검증 실패 시 해당 이전
Preview에 alias를 다시 연결합니다. 코드 dev 반영과 실제 배포 성공은 별도로 보고합니다.
