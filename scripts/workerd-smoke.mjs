#!/usr/bin/env node
/**
 * Phase 1 smoke test (docs/MIGRATION.md): two headless browsers, Alice and
 * Bob, against Co-farer running on plain workerd (`npm run workerd`).
 * Checks live updates between them, presence and the local AI stand-in, and
 * sets a housing deadline so the next cron run can lock it.
 *
 *   node scripts/workerd-smoke.mjs        (prints the trip id at the end)
 */

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

const browser = await chromium.launch()
async function signIn(user) {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`    [${user} page error] ${e.message}`))
  await page.goto(`${BASE}/api/auth/stub-login?user=${user}`)
  await page.waitForURL(/\/trips$/, { timeout: 15_000 })
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
    () => [...document.querySelectorAll('[data-testid="members-stack"] [title]')].some((el) => /Bob Stub · online/.test(el.getAttribute('title') ?? '')),
    null,
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

console.log(`\ntrip: ${tripId}`)
await browser.close()
