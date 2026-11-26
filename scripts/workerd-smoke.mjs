#!/usr/bin/env node
/**
 * Phase 1 smoke test (docs/MIGRATION.md): two headless browsers, Alice and
 * Bob, against Co-farer running on plain workerd (`npm run workerd`).
 * Checks live updates between them, presence and the local AI stand-in, and
 * sets a housing deadline so the next cron run can lock it.
 *
 *   node scripts/workerd-smoke.mjs        (prints the trip id at the end)
 *
 * Phase 2b: `--cognito <users.json>` signs both users in through the real
 * Amazon Cognito page instead of the stand-in (the app's sign-in dialog →
 * Cognito managed login → password), then also checks sign-out. The file is
 * [{ email, password, name }, …] for two existing users in the pool; use
 * @deepspace.test emails so the local server gives them the free AI
 * stand-in. Keep that file out of the repo.
 */

import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:8080'
const ok = (label) => console.log(`  ✓ ${label}`)
const fail = (label, err) => {
  console.log(`  ✗ ${label}: ${err?.message ?? err}`)
  process.exitCode = 1
}
async function check(label, fn) {
  try {
    await fn()
    ok(label)
  } catch (err) {
    fail(label, err)
  }
}

const cognitoFile = process.argv.includes('--cognito') ? process.argv[process.argv.indexOf('--cognito') + 1] : null
const cognitoUsers = cognitoFile ? JSON.parse(readFileSync(cognitoFile, 'utf8')) : null
const NAMES = cognitoUsers ? { alice: cognitoUsers[0].name, bob: cognitoUsers[1].name } : { alice: 'Alice Stub', bob: 'Bob Stub' }

const browser = await chromium.launch()
async function signIn(user) {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`    [${user} page error] ${e.message}`))
  if (!cognitoUsers) {
    await page.goto(`${BASE}/api/auth/stub-login?user=${user}`)
    await page.waitForURL(/\/trips$/, { timeout: 15_000 })
    return page
  }
  // The real path: the app's dialog → Cognito managed login → password.
  const u = cognitoUsers[user === 'alice' ? 0 : 1]
  await page.goto(`${BASE}/trips`)
  await page.getByRole('button', { name: 'Sign in' }).first().click({ timeout: 15_000 })
  await page.getByTestId('sign-in-email').click()
  await page.locator('input[name=username]').fill(u.email, { timeout: 20_000 })
  await page.getByRole('button', { name: 'Next' }).click()
  // Cognito offers the email code first; this test uses the password instead.
  const other = page.getByRole('button', { name: 'Try another way' })
  const pw = page.locator('input[type=password]')
  await Promise.race([other.waitFor({ timeout: 20_000 }), pw.waitFor({ timeout: 20_000 })])
  if (await other.isVisible()) {
    await other.click()
    await page.locator('input[type=radio][value=USER_PASSWORD_AUTH]').check({ force: true, timeout: 15_000 })
    await page.getByRole('button', { name: 'Continue' }).click()
  }
  await pw.first().fill(u.password, { timeout: 15_000 })
  await page.locator('button[type=submit]').filter({ hasText: /sign in|continue|next/i }).first().click()
  await page.waitForURL(new RegExp(`^${BASE}/trips`), { timeout: 30_000 })
  return page
}
async function action(page, name, params) {
  return page.evaluate(
    async ({ name, params }) => {
      const t = await fetch('/api/auth/token', { method: 'POST', credentials: 'include' })
      const { token } = await t.json()
      const res = await fetch(`/api/actions/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(params),
      })
      return res.json()
    },
    { name, params },
  )
}

const a = await signIn('alice')
const b = await signIn('bob')
let tripId = ''

await check('both users see the app signed in (My trips)', async () => {
  for (const p of [a, b]) await p.getByRole('heading', { name: 'My trips' }).waitFor({ timeout: 15_000 })
})

await check('Alice creates a trip in the UI and opens it', async () => {
  const res = await action(a, 'createTrip', { name: `Workerd ${Date.now().toString(36)}`, destination: 'Cachuma Lake' })
  if (!res.success) throw new Error(JSON.stringify(res))
  tripId = res.data.tripId
  await a.goto(`${BASE}/trip/${tripId}`)
  await a.getByTestId('trip-name').waitFor({ timeout: 15_000 })
})

let code = ''
await check('Bob joins through the invite link', async () => {
  await a.getByTestId('members-stack').click({ timeout: 15_000 })
  code = new URL(await a.getByTestId('invite-link').inputValue()).pathname.split('/')[2]
  await a.keyboard.press('Escape')
  await b.goto(`${BASE}/join/${code}`)
  await b.getByTestId('join-button').click({ timeout: 15_000 })
  await b.waitForURL(/settings\?welcome=1/, { timeout: 20_000 })
})

await check('Bob sets a budget (public by default); Alice sees it live', async () => {
  await b.locator('#budget-housing-input').fill('150')
  await b.getByTestId('save-budgets').click()
  await b.waitForURL(new RegExp(`/trip/${tripId}$`), { timeout: 20_000 })
  await a.getByTestId('members-stack').click()
  await a.getByTestId('member-public-budgets').filter({ hasText: 'Housing $150' }).waitFor({ timeout: 15_000 })
  await a.keyboard.press('Escape')
})

await check('presence: Alice sees Bob online (colored circle)', async () => {
  await a.waitForFunction(
    (name) => [...document.querySelectorAll('[data-testid="members-stack"] [title]')].some((el) => new RegExp(`${name} · online`).test(el.getAttribute('title') ?? '')),
    NAMES.bob,
    { timeout: 15_000 },
  )
})

await check('Alice locks dates; Bob’s date bar updates live', async () => {
  const res = await action(a, 'lockDates', { tripId, start: '2027-01-08', end: '2027-01-10' })
  if (!res.success) throw new Error(JSON.stringify(res))
  await b.getByTestId('dates-summary').filter({ hasText: 'Locked' }).waitFor({ timeout: 15_000 })
})

await check('Suggest (free local AI stand-in) adds housing options for both', async () => {
  await a.goto(`${BASE}/trip/${tripId}?section=housing`)
  await a.getByTestId('suggest').click({ timeout: 15_000 })
  await a.getByTestId('option-card').nth(4).waitFor({ timeout: 30_000 })
  await b.goto(`${BASE}/trip/${tripId}?section=housing`)
  await b.getByTestId('option-card').nth(4).waitFor({ timeout: 15_000 })
})

await check('votes update live in the other browser', async () => {
  const card = (p) => p.locator('[data-option-title="Test stay 1"]')
  await card(a).getByTestId('vote').click()
  await card(b).getByTestId('vote-count').filter({ hasText: '1 vote' }).waitFor({ timeout: 15_000 })
  await card(b).getByTestId('vote').click()
  await card(a).getByTestId('vote-count').filter({ hasText: '2 votes' }).waitFor({ timeout: 15_000 })
})

await check('a note from Bob appears for Alice live', async () => {
  await a.goto(`${BASE}/trip/${tripId}?section=notes`)
  await b.goto(`${BASE}/trip/${tripId}?section=notes`)
  await b.getByTestId('note-input').fill('Written on workerd')
  await b.getByTestId('add-note').click()
  await a.locator('[data-testid="note"]').filter({ hasText: 'Written on workerd' }).waitFor({ timeout: 15_000 })
})

await check('housing deadline set 60 seconds ahead (the cron task locks it later)', async () => {
  const res = await action(a, 'setDeadline', { tripId, module: 'housing', seconds: 60 })
  if (!res.success) throw new Error(JSON.stringify(res))
})

if (cognitoUsers) {
  await check('signed in as the Cognito users (session, app token)', async () => {
    for (const [p, u] of [[a, cognitoUsers[0]], [b, cognitoUsers[1]]]) {
      const s = await p.evaluate(async () => (await fetch('/api/auth/get-session')).json())
      if (s?.user?.email !== u.email || s.user.name !== u.name) throw new Error(`session: ${JSON.stringify(s?.user)}`)
    }
  })
  await check('sign out ends the session (token refused afterwards)', async () => {
    await b.goto(`${BASE}/auth/logout`)
    await b.waitForURL(new RegExp(`^${BASE}/`), { timeout: 20_000 })
    const status = await b.evaluate(async () => (await fetch('/api/auth/token', { method: 'POST' })).status)
    if (status !== 401) throw new Error(`token after sign-out: HTTP ${status}`)
    if ((await b.evaluate(async () => (await fetch('/api/auth/get-session')).json())) !== null) throw new Error('session still there')
  })
}

console.log(`\ntrip: ${tripId}`)
await browser.close()
