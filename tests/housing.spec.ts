/**
 * Module 3 (Housing) — the "done when" list from PLAN.md §4.3, with three
 * users (fit counts only appear with 3+ budgets). The AI is the local test
 * stand-in (test accounts on a local server; see src/actions/engine-ai.ts),
 * so this costs nothing.
 *  - Before dates lock, Housing says it's waiting.
 *  - After lock, suggestions show sources (and a fabricated source is dropped).
 *  - A pasted link gets researched.
 *  - Votes update live in other browsers.
 *  - Fit counts change when B changes their budget.
 *  - Locking works and blocks later votes; the price becomes the estimate.
 *  - Unlocking the dates clears housing; after relocking, Suggest works again.
 *  - The cap message shows at the cap.
 * Plus the human's changes: remove a place, total price (with per person),
 * deadline as a number of days, "New" outline until you point at a card.
 */

import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { cleanupTestTrips } from './helpers/cleanup'

test.skip(loadAllTestAccounts().length < 3, 'Needs 3 test accounts (alice/bob/carol-cofarer@deepspace.test).')

// Delete the trips these tests created, so test accounts never pile them up.
test.afterEach(cleanupTestTrips)

type Res = { success: boolean; code?: string; error?: string; data?: Record<string, unknown> }

async function action(page: Page, name: string, params: Record<string, unknown>): Promise<Res> {
  return page.evaluate(
    async ({ name, params }) => {
      const t = await fetch('/api/auth/token', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      const { token } = (await t.json()) as { token: string }
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

function nextMonthDay(d: number): string {
  const now = new Date()
  const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const m = ((now.getMonth() + 1) % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

async function setupTrip(users: Page[]) {
  const [a, ...rest] = users
  for (const p of users) {
    await p.goto('/trips')
    await expect(p.getByRole('heading', { name: 'My trips' })).toBeVisible({ timeout: 15_000 })
  }
  const created = await action(a, 'createTrip', { name: `Housing ${Date.now().toString(36)}`, destination: 'Cachuma Lake' })
  const tripId = created.data!.tripId as string
  await a.goto(`/trip/${tripId}`)
  await a.getByTestId('members-stack').click({ timeout: 15_000 })
  const code = new URL(await a.getByTestId('invite-link').inputValue()).pathname.split('/')[2]
  await a.keyboard.press('Escape')
  for (const p of rest) expect(await action(p, 'joinTrip', { inviteCode: code })).toMatchObject({ success: true })
  return tripId
}

const H = { tripId: '', module: 'housing' }

test('Housing: wait, suggest, paste, remove, vote live, fit, lock, unlock clears', async ({ users }) => {
  test.setTimeout(180_000)
  const [a, b, c] = (await users(3)).map((u) => u.page)
  const tripId = await setupTrip([a, b, c])
  const h = { ...H, tripId }

  // Before dates lock: the section is disabled and says it's waiting.
  await a.goto(`/trip/${tripId}`)
  await a.getByTestId('section-housing').click({ force: true, timeout: 15_000 })
  await expect(a.getByText('Housing opens once the dates are locked.').first()).toBeVisible()
  expect(await action(a, 'suggestOptions', h)).toMatchObject({ success: false, code: 'waiting_for_dates' })

  // Budgets: A 100, B 150, C 30 (housing). C keeps theirs private: it still counts in fit.
  expect(await action(a, 'setMyBudgets', { tripId, housing: 100 })).toMatchObject({ success: true })
  expect(await action(b, 'setMyBudgets', { tripId, housing: 150 })).toMatchObject({ success: true })
  expect(await action(c, 'setMyBudgets', { tripId, housing: 30, isPublic: false })).toMatchObject({ success: true })
  expect(await action(a, 'lockDates', { tripId, start: nextMonthDay(19), end: nextMonthDay(21) })).toMatchObject({ success: true })

  // Open the section: it expands and the URL says so; Escape closes it.
  await expect(a.getByTestId('section-housing')).toHaveAttribute('aria-expanded', 'false', { timeout: 15_000 })
  await a.getByTestId('section-housing').click()
  await expect(a.getByTestId('section-panel-housing')).toBeVisible()
  await expect(a).toHaveURL(/section=housing/)
  await a.keyboard.press('Escape')
  await expect(a.getByTestId('section-panel-housing')).toHaveCount(0)
  await expect(a).not.toHaveURL(/section=housing/)

  // Suggest: 5 options with sources; the fabricated one and fake source are gone.
  await a.getByTestId('section-housing').click()
  await a.getByTestId('suggest').click()
  await expect(a.getByTestId('option-card')).toHaveCount(5, { timeout: 30_000 })
  await expect(a.getByTestId('option-sources').first()).toContainText('example.test')
  await expect(a.getByTestId('section-panel-housing')).not.toContainText('evil.example')
  await expect(a.getByTestId('section-panel-housing')).not.toContainText('Invented place')
  await expect(a.getByTestId('option-price').filter({ hasText: 'Price not found' })).toHaveCount(1)
  // Total and per person together: $120 for 3 people → $40 each.
  await expect(a.locator('[data-option-title="Test stay 1"]').getByTestId('option-total')).toHaveText('$120 total · 3 people')

  // New suggestions are outlined until you point at them.
  await expect(a.locator('[data-testid="option-card"][data-new="true"]')).toHaveCount(5)
  await a.locator('[data-option-title="Test stay 1"]').hover()
  await expect(a.locator('[data-option-title="Test stay 1"]')).not.toHaveAttribute('data-new', 'true')
  await expect(a.locator('[data-testid="option-card"][data-new="true"]')).toHaveCount(4)

  // Fit: "Test stay 1" is $40/person → over for C (30, private): 1 of 3.
  const stay1 = a.locator('[data-option-title="Test stay 1"]')
  await expect(stay1.getByTestId('option-fit')).toHaveText('Over the housing budget for 1 of 3')
  // C's private number never reaches A: A sees B's public $150, nothing for C.
  await a.keyboard.press('Escape')
  await a.getByTestId('members-stack').click()
  await expect(a.getByTestId('member-public-budgets')).toHaveCount(2, { timeout: 15_000 }) // A and B
  await expect(a.getByTestId('members-list')).not.toContainText('$30')
  await a.keyboard.press('Escape')
  await a.getByTestId('section-housing').click()
  // B lowers their housing budget to 20 → 2 of 3, live.
  expect(await action(b, 'setMyBudgets', { tripId, housing: 20 })).toMatchObject({ success: true })
  await expect(stay1.getByTestId('option-fit')).toHaveText('Over the housing budget for 2 of 3', { timeout: 15_000 })

  // A pasted link gets researched.
  await a.getByTestId('add-option-input').fill('https://lakeview.example/yurts')
  await a.getByTestId('add-option').click()
  await expect(a.getByTestId('option-card').filter({ hasText: 'Added by' })).toHaveCount(1, { timeout: 30_000 })
  await expect(a.getByTestId('option-card').filter({ hasText: 'Added by' }).getByTestId('option-sources')).toBeVisible()

  // A member can't remove someone else's place; the person who added it can.
  const pastedId = await a.getByTestId('option-card').filter({ hasText: 'Added by' }).getAttribute('data-option-id')
  expect(await action(b, 'removeOption', { ...h, optionId: pastedId })).toMatchObject({ code: 'not_allowed' })
  await a.getByTestId('option-card').filter({ hasText: 'Added by' }).getByTestId('remove-option').click()
  await a.getByRole('button', { name: 'Remove' }).last().click()
  await expect(a.getByTestId('option-card')).toHaveCount(5, { timeout: 15_000 })

  // Votes update live in B's browser.
  await b.goto(`/trip/${tripId}?section=housing`)
  await expect(b.getByTestId('section-panel-housing')).toBeVisible({ timeout: 15_000 })
  await stay1.getByTestId('vote').click()
  await expect(b.locator('[data-option-title="Test stay 1"]').getByTestId('vote-count')).toHaveText('1 vote', { timeout: 15_000 })
  await b.locator('[data-option-title="Test stay 1"]').getByTestId('vote').click()
  await expect(a.locator('[data-option-title="Test stay 1"]').getByTestId('vote-count')).toHaveText('2 votes', { timeout: 15_000 })

  // Members can't lock or set deadlines; past deadlines are refused.
  expect(await action(b, 'lockBoard', h)).toMatchObject({ code: 'not_organizer' })
  for (const days of [0, 31, 2.5]) expect(await action(a, 'setDeadline', { ...h, days })).toMatchObject({ code: 'bad_request' })
  // The organizer gives everyone a number of days; the status counts them down.
  await a.getByTestId('deadline-days').fill('3')
  await a.getByTestId('set-deadline').click()
  await expect(a.getByTestId('housing-status')).toContainText('Voting closes in 3 days', { timeout: 15_000 })

  // Organizer locks the top option; later votes are refused; estimate appears.
  await a.getByTestId('lock-top').click()
  await expect(a.getByTestId('housing-status')).toContainText('Housing is locked', { timeout: 15_000 })
  await expect(b.getByTestId('housing-status')).toContainText('Housing is locked', { timeout: 15_000 })
  // A locked board refuses votes before looking at the option.
  expect(await action(a, 'toggleVote', { ...h, optionId: 'any' })).toMatchObject({ code: 'board_locked' })
  await a.keyboard.press('Escape')
  await expect(a.getByTestId('my-essentials')).toContainText('$40 of $100', { timeout: 15_000 })

  // Unlocking the dates warns, then clears housing: waiting again, no places or votes.
  await a.getByTestId('dates-bar').click()
  await a.getByTestId('unlock-dates').click()
  await expect(a.getByText('Housing will have to be researched again')).toBeVisible()
  await a.getByRole('button', { name: 'Unlock dates' }).last().click()
  await expect(a.getByTestId('section-housing')).toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 })
  expect(await action(a, 'lockDates', { tripId, start: nextMonthDay(20), end: nextMonthDay(22) })).toMatchObject({ success: true })
  await a.goto(`/trip/${tripId}?section=housing`)
  await expect(a.getByText('No places yet. Get suggestions')).toBeVisible({ timeout: 15_000 })
  await expect(a.getByTestId('option-card')).toHaveCount(0)
  await expect(a.getByTestId('housing-status')).not.toContainText('locked')
  // Fresh suggestions for the new dates.
  await a.getByTestId('suggest').click()
  await expect(a.getByTestId('option-card')).toHaveCount(5, { timeout: 30_000 })
})

test('Housing: deadline auto-locks the top option; cap and price rules', async ({ users }) => {
  test.setTimeout(180_000)
  const [a, b] = (await users(2)).map((u) => u.page)
  const tripId = await setupTrip([a, b])
  const h = { ...H, tripId }
  expect(await action(a, 'lockDates', { tripId, start: nextMonthDay(5), end: nextMonthDay(7) })).toMatchObject({ success: true })

  // A member sets a missing price as the total for the stay; it's split per person and labeled.
  const added = await action(b, 'addOption', { ...h, input: 'Lakeside cabin' })
  const optionId = added.data!.optionId as string
  expect(await action(b, 'setOptionPrice', { ...h, optionId, totalPrice: 3.5 })).toMatchObject({ code: 'bad_request' })
  await a.goto(`/trip/${tripId}?section=housing`)
  const cabin = a.locator('[data-option-title="Lakeside cabin"]')
  await cabin.getByTestId('edit-price').click({ timeout: 15_000 })
  await cabin.getByTestId('price-input').fill('110')
  await expect(cabin.getByText('≈ $55 / person')).toBeVisible()
  await cabin.getByTestId('save-price').click()
  await expect(cabin.getByTestId('option-price')).toContainText('$55', { timeout: 15_000 })
  await expect(cabin.getByTestId('option-total')).toHaveText('$110 total · 2 people')
  await expect(cabin.getByText('added by a member')).toBeVisible()
  // The organizer can remove anyone's place (checked on a throwaway one).
  const extra = await action(b, 'addOption', { ...h, input: 'Throwaway' })
  expect(await action(a, 'removeOption', { ...h, optionId: extra.data!.optionId })).toMatchObject({ success: true })

  // Deadline a few seconds out, one vote, then the deadline passes: the next vote locks the top option.
  expect(await action(b, 'toggleVote', { ...h, optionId })).toMatchObject({ success: true })
  // (`seconds` is accepted only for test accounts on a local server.)
  expect(await action(a, 'setDeadline', { ...h, seconds: 3 })).toMatchObject({ success: true })
  await a.waitForTimeout(3500)
  expect(await action(a, 'toggleVote', { ...h, optionId })).toMatchObject({ success: false, code: 'voting_closed' })
  await expect(a.getByTestId('housing-status')).toContainText('Housing is locked', { timeout: 15_000 })

  // The cap: a fresh trip used up to 25 calls, then a clear refusal and message.
  const trip2 = await setupTrip([a])
  const h2 = { ...H, tripId: trip2 }
  expect(await action(a, 'lockDates', { tripId: trip2, start: nextMonthDay(5), end: nextMonthDay(6) })).toMatchObject({ success: true })
  for (let i = 0; i < 25; i++) {
    const r = await action(a, 'addOption', { ...h2, input: `Place ${i}` })
    expect(r.success).toBe(true)
  }
  const capped = await action(a, 'suggestOptions', h2)
  expect(capped).toMatchObject({ success: false, code: 'research_cap' })
  // Adding by hand still works past the cap (not researched).
  expect(await action(a, 'addOption', { ...h2, input: 'One more' })).toMatchObject({ success: true, data: { researched: false } })
  await a.goto(`/trip/${trip2}?section=housing`)
  await expect(a.getByTestId('cap-message')).toBeVisible({ timeout: 15_000 })
  await expect(a.getByTestId('research-usage')).toHaveText('AI research: 25 of 25 used')
})
