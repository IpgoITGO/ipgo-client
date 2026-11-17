import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fixtureResponse } from './browser-fixtures.mjs'

const policy = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../src/features/legal/model/fixtures/signup-policy.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

// 검증용 Vite 서버에서만 합성 확정 문서를 제공한다. 실제 빌드 설정/문서는 변경하지 않는다.
export function publishedPolicyFixturePlugin() {
  return {
    name: 'signup-policy-verification-fixture',
    enforce: 'pre',
    load(id) {
      if (id.endsWith('/src/features/legal/model/signupPolicy.ts'))
        return `export const signupPolicy = ${JSON.stringify(policy)}`
    },
  }
}

export async function verifySignupPolicy({
  browser,
  origin,
  out,
  name,
  width,
  height,
}) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  const errors = [],
    blocked = [],
    submissions = []
  page.on('pageerror', () => errors.push('PAGE_ERROR'))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const pathname = new URL(message.location().url || origin).pathname
    if (
      ['/api/auth/me', '/api/auth/refresh'].includes(pathname) &&
      message.text().includes('401')
    )
      return
    errors.push('CONSOLE_ERROR')
  })
  await context.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      method = request.method()
    if (url.origin === origin) {
      if (
        (url.pathname === '/api/auth/refresh' && method === 'POST') ||
        (url.pathname === '/api/auth/me' && method === 'GET')
      )
        return route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } })
      if (url.pathname === '/api/auth/email-availability' && method === 'GET')
        return route.fulfill({ json: { available: true } })
      if (url.pathname === '/api/auth/email-verifications' && method === 'POST')
        return route.fulfill({ status: 202, json: { expiresIn: 600 } })
      if (
        url.pathname === '/api/auth/email-verifications/confirm' &&
        method === 'POST'
      )
        return route.fulfill({ json: { verificationToken: 'fixture-only' } })
      if (url.pathname === '/api/auth/signup' && method === 'POST') {
        submissions.push(request.postDataJSON().agreements)
        return route.fulfill({
          status: 201,
          json: {
            userId: 12,
            email: 'consent@example.test',
            companyName: '합성 회사',
            managerName: '합성 담당',
          },
        })
      }
    }
    const response = fixtureResponse(url, method, origin)
    if (response.blocked) {
      blocked.push(`${method} ${url.pathname}: ${response.blocked}`)
      return route.abort()
    }
    return response.asset
      ? route.continue()
      : route.fulfill({ status: 200, ...response })
  })
  try {
    for (const [pathname, text] of [
      ['/terms', policy.terms],
      ['/privacy', policy.privacy],
    ]) {
      await page.goto(`${origin}${pathname}`)
      await page.getByText(text, { exact: true }).waitFor()
      assert.ok(
        await page.evaluate(
          () =>
            globalThis.document.documentElement.scrollWidth <=
            globalThis.innerWidth,
        ),
      )
    }
    await page.goto(`${origin}/signup`)
    await page.getByLabel('회사명 (상호)', { exact: true }).fill('합성 회사')
    await page.getByLabel('사업자등록번호', { exact: true }).fill('1234567891')
    await page.getByLabel('담당자 이름', { exact: true }).fill('합성 담당')
    await page.getByRole('button', { name: '다음', exact: true }).click()
    await page
      .getByLabel('이메일', { exact: true })
      .fill('consent@example.test')
    await page.getByRole('button', { name: '중복 확인', exact: true }).click()
    await page
      .getByRole('button', { name: '인증 코드 받기', exact: true })
      .click()
    await page.getByLabel('인증 코드', { exact: true }).fill('482915')
    await page.getByRole('button', { name: '확인', exact: true }).click()
    await page.getByText('인증을 마쳤어요.', { exact: true }).waitFor()
    await page.getByRole('button', { name: '다음', exact: true }).click()
    await page.getByLabel('비밀번호', { exact: true }).fill('Abcd123!')
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('Abcd123!')
    const submit = page.getByRole('button', { name: '가입하기', exact: true })
    assert.equal(await submit.isEnabled(), false)
    await page
      .getByRole('button', { name: '수집·이용 동의서 전문 보기', exact: true })
      .click()
    const dialog = page.getByRole('dialog', {
      name: '개인정보 수집·이용 동의서',
    })
    await dialog.getByText(policy.privacyConsent, { exact: true }).waitFor()
    await dialog.getByRole('button', { name: '닫기', exact: true }).click()
    assert.equal(
      await page.getByLabel('비밀번호', { exact: true }).inputValue(),
      'Abcd123!',
    )
    await page.getByRole('checkbox', { name: '전체 동의', exact: true }).check()
    assert.equal(await submit.isEnabled(), true)
    assert.ok(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
    )
    await page.screenshot({
      path: path.join(out, `${name}-signup-agreements.png`),
      fullPage: true,
    })
    await submit.click()
    await page.getByRole('heading', { name: '로그인', exact: true }).waitFor()
    assert.deepEqual(submissions, [
      { terms: true, privacy: true, version: policy.version },
    ])
    assert.deepEqual(blocked, [])
    assert.deepEqual(errors, [])
    return {
      viewport: `${name}-signup`,
      width,
      passed: true,
      provenance: 'synthetic_published_policy_and_local_API',
      checks: [
        'public_documents',
        'required_agreements',
        'modal_preserves_input',
        'agreements_payload',
        'no_overflow',
        'no_unexpected_browser_errors',
      ],
      business_e2e: 'not_verified',
      external_api_write: false,
    }
  } catch (error) {
    await page
      .screenshot({
        path: path.join(out, `${name}-signup-failure.png`),
        fullPage: true,
      })
      .catch(() => {})
    throw error
  } finally {
    await context.close()
  }
}
