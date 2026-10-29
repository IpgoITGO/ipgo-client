import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertAutoCreateLimit,
  extractJiraKeys,
  indexGithubIssuesByJiraKey,
  isSyncedGithubComment,
  isSyncedJiraComment,
  readSyncMarker,
  resolveDateSync,
  shouldAutoCreateGithubIssue,
  writeSyncMarker,
} from './sync-lib.mjs'

test('Jira 키를 중복 없이 추출한다', () => {
  assert.deepEqual(extractJiraKeys('[IPGO-77] 작업', 'IPGO-77 IPGO-12'), [
    'IPGO-77',
    'IPGO-12',
  ])
})

test('저장소 Issue 목록을 Jira 키로 색인하고 PR은 제외한다', () => {
  const first = { number: 47, title: '[IPGO-77] 배포 자동화' }
  const duplicate = { number: 48, title: '[IPGO-77] 중복 Issue' }
  const pullRequest = {
    number: 99,
    title: '[IPGO-99] PR',
    pull_request: { url: 'https://api.github.com/pulls/99' },
  }
  const indexed = indexGithubIssuesByJiraKey([first, duplicate, pullRequest])

  assert.equal(indexed.get('IPGO-77'), first)
  assert.equal(indexed.has('IPGO-99'), false)
})

test('날짜 한쪽만 바뀌면 반대쪽을 갱신한다', () => {
  assert.deepEqual(
    resolveDateSync({
      jiraValue: '2026-10-30',
      githubValue: '2026-10-28',
      previousValue: '2026-10-28',
    }),
    { finalValue: '2026-10-30', update: 'github', conflict: false },
  )
})

test('날짜가 양쪽에서 충돌하면 Jira 값을 우선한다', () => {
  assert.deepEqual(
    resolveDateSync({
      jiraValue: '2026-11-01',
      githubValue: '2026-11-02',
      previousValue: '2026-10-28',
    }),
    { finalValue: '2026-11-01', update: 'github', conflict: true },
  )
})

test('Issue 본문의 동기화 날짜를 보존하고 갱신한다', () => {
  const first = writeSyncMarker('본문', {
    start: '2026-10-28',
    due: null,
  })
  const second = writeSyncMarker(first, {
    start: '2026-10-29',
    due: '2026-11-03',
  })

  assert.deepEqual(readSyncMarker(second), {
    start: '2026-10-29',
    due: '2026-11-03',
  })
  assert.equal(second.match(/jira-github-sync/g)?.length, 1)
})

test('반대편에서 복제된 댓글을 식별한다', () => {
  assert.equal(
    isSyncedGithubComment('내용\n<!-- sync:jira-comment:10001 -->'),
    true,
  )
  assert.equal(isSyncedJiraComment('내용 [sync:github-comment:42]'), true)
})

test('신규 Issue 생성 기준 시각 이후의 Jira 작업만 자동 생성한다', () => {
  const autoCreateAfter = '2026-10-28T18:11:00+09:00'

  assert.equal(
    shouldAutoCreateGithubIssue({
      jiraCreatedAt: '2026-10-28T18:10:59.999+0900',
      autoCreateAfter,
    }),
    false,
  )
  assert.equal(
    shouldAutoCreateGithubIssue({
      jiraCreatedAt: '2026-10-28T18:11:00.000+0900',
      autoCreateAfter,
    }),
    true,
  )
})

test('신규 Issue 생성 기준 시각이 잘못되면 중단한다', () => {
  assert.throws(
    () =>
      shouldAutoCreateGithubIssue({
        jiraCreatedAt: '2026-10-28T18:11:00.000+0900',
        autoCreateAfter: '오늘부터',
      }),
    /ISO 8601/,
  )
})

test('신규 Issue 자동 생성 후보가 안전 한도를 넘으면 중단한다', () => {
  assert.doesNotThrow(() => assertAutoCreateLimit(5, 5))
  assert.throws(() => assertAutoCreateLimit(6, 5), /안전 한도 5건/)
  assert.throws(() => assertAutoCreateLimit(1, -1), /0 이상의 정수/)
})
