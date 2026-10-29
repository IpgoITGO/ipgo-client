# Ipgo Client 개발 지침

- 적용 범위: 이 저장소 전체
- 작업 시작 전 연결된 Issue의 목적과 완료 조건을 확인합니다.
- 한 Issue와 PR에는 하나의 작업 목적만 포함합니다.

## 개발 흐름

- 최신 `dev`에서 `feature/<issue-number>-<description>` 브랜치를 만듭니다.
- 구현과 검증 후 `dev` 대상 PR을 생성합니다.
- `dev` PR은 승인 수를 강제하지 않지만 미해결 리뷰 대화가 있으면 병합하지 않습니다.
- `main` 변경은 `dev → main` PR로만 진행합니다.
- `main`에 직접 push하거나 force push하지 않습니다.
- `main` PR은 작성자 외 팀원 1명의 승인을 받아야 합니다.

## Jira·GitHub·배포 자동화

- Jira는 작업명·담당자·기간·상태를, GitHub Issue는 상세 작업과 개발 논의를 기록합니다.
- Issue·PR 제목이나 branch에는 연결된 Jira 키를 포함합니다.
- `dev → main` PR 제목에는 운영 배포 후 완료할 Jira 키를 모두 포함합니다. PR 본문만으로는 운영
  완료 자동화가 키를 찾지 못합니다.
- PR 자동 승인·자동 병합과 Jira 스프린트 자동 배정은 사용하지 않습니다.
- 미배정 AI 작업은 이석형, 미배정 서버 작업은 정무영을 기본 담당자로 검토합니다. 기존
  담당자가 있거나 양쪽 담당자가 다르면 자동으로 덮어쓰지 않습니다.
- 사람이 병합한 뒤 `dev` push는 개발 배포, `main` push는 운영 후보 검증과 승격을 시작합니다.
- 동기화나 배포 workflow를 바꾸면 [자동화 운영](docs/automation.md)과 관련 테스트를 함께
  갱신합니다.

## 작성과 검증

- Issue와 PR은 쉬운 한국어로 작성하고 기술 용어는 자연스러운 영어 표기를 유지합니다.
- commit은 `type: short English summary` 형식을 사용합니다.
- PR에는 상세 변경, 충돌 위험도, 영향과 실제 검증 결과를 기록합니다.
- 모든 작업에서 README를 확인하고 동작·구조·실행 방법이 바뀌면 같은 PR에서 갱신합니다.
- 변경 범위에 맞는 검사를 실행하고 결과를 PR에 남깁니다.

## 안전

- 비밀값, 인증정보, 개인정보와 `.env` 내용을 출력하거나 commit하지 않습니다.
- 기존 사용자 변경과 현재 Issue에 무관한 변경을 섞지 않습니다.
- 외부 공개, 배포, 삭제와 복구하기 어려운 변경은 실행 전 대상과 영향을 확인합니다.

## 세부 문서

| 작업 | 문서 |
|---|---|
| branch·Issue·PR 흐름 | [작업 흐름](docs/rules/workflow.md) |
| 문장·commit·Markdown 형식 | [작성 규칙](docs/rules/conventions.md) |
| 비밀값·공유 파일·외부 영향 | [안전 규칙](docs/rules/safety.md) |
| Jira·GitHub 동기화와 Vercel 배포 | [자동화 운영](docs/automation.md) |
