/**
 * The Additional module (Activities and Food, PLAN.md §4.6–4.7), with two
 * users and the local AI stand-in (free).
 *  - Activity suggestions appear, a pasted link works, ranking follows votes.
 *  - B marks vegetarian; food suggestions reflect it; a place without
 *    vegetarian options shows the triangle and stays on the list.
 * Plus the human's decisions: open before the dates lock; per-person prices
 * typed in; unknown dietary info counts as "may not suit"; unlocking the
 * dates leaves these lists alone. And the server rules: never lockable,
 * only the adder or organizer removes, food preferences are checked.
 */

import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from './helpers/fixtures'
import { cleanupTestTrips } from './helpers/cleanup'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 test accounts.')

test.afterEach(cleanupTestTrips)

type Res = { success: boolean; code?: string; data?: Record<string, unknown> }

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

const cards = (p: Page, module: 'activities' | 'food') => p.getByTestId(`card-${module}`)
const card = (p: Page, module: 'activities' | 'food', title: string) => p.locator(`[data-testid="card-${module}"][data-option-title="${title}"]`)

test('Additional: activities suggest, paste, rank; food prefs, warnings, prices, rules', async ({ users }) => {
  test.setTimeout(180_000)
  const [a, b] = (await users(2)).map((u) => u.page)
  for (const p of [a, b]) {
    await p.goto('/trips')
    await expect(p.getByRole('heading', { name: 'Where to next?' })).toBeVisible({ timeout: 15_000 })
  }
  const tripId = (await action(a, 'createTrip', { name: `Additional ${Date.now().toString(36)}`, destination: 'Cachuma Lake' })).data!.tripId as string
  await a.goto(`/trip/${tripId}`)
  await a.getByTestId('members-stack').click({ timeout: 15_000 })
  const code = new URL(await a.getByTestId('invite-link').inputValue()).pathname.split('/')[2]
  await a.keyboard.press('Escape')
  expect(await action(b, 'joinTrip', { inviteCode: code })).toMatchObject({ success: true })
  const act = { tripId, module: 'activities' }

  // Open before the dates lock; both lists side by side.
  await a.goto(`/trip/${tripId}?section=additional`)
  await expect(a.getByTestId('additional-full')).toBeVisible({ timeout: 15_000 })

  // Activities: Suggest makes 10, with sources; a free one and a missing price; the invented one is dropped.
  await a.getByTestId('suggest-activities').click()
  await expect(cards(a, 'activities')).toHaveCount(10, { timeout: 30_000 })
  await expect(card(a, 'activities', 'Test activity 3').getByTestId('price')).toHaveText('Free')
  await expect(card(a, 'activities', 'Test activity 2').getByTestId('price')).toHaveText('Price not found')
  await expect(card(a, 'activities', 'Test activity 1').getByTestId('option-sources')).toContainText('example.test')
  await expect(a.getByTestId('list-activities')).not.toContainText('Invented place')
  await expect(a.getByTestId('suggest-activities')).toHaveText(/Search for more/)

  // A pasted link gets researched.
  await a.getByTestId('add-input-activities').fill('https://kayaks.example/rentals')
  await a.getByTestId('add-activities').click()
  await expect(cards(a, 'activities').filter({ hasText: 'Added by' })).toHaveCount(1, { timeout: 30_000 })
  await expect(cards(a, 'activities')).toHaveCount(11)

  // Ranking follows votes, live: B votes for activity 5, and it moves to the top for A.
  await b.goto(`/trip/${tripId}?section=additional`)
  await card(b, 'activities', 'Test activity 5').getByTestId('vote').click({ timeout: 15_000 })
  await expect(cards(a, 'activities').first()).toHaveAttribute('data-option-title', 'Test activity 5', { timeout: 15_000 })
  await card(a, 'activities', 'Test activity 4').getByTestId('vote').click()
  await card(b, 'activities', 'Test activity 4').getByTestId('vote').click()
  await expect(cards(a, 'activities').first()).toHaveAttribute('data-option-title', 'Test activity 4', { timeout: 15_000 })

  // A typed-in price is per person and labeled.
  const act2 = await card(a, 'activities', 'Test activity 2').getAttribute('data-option-id')
  expect(await action(b, 'setOptionPrice', { ...act, optionId: act2, pricePerPerson: 2.5 })).toMatchObject({ code: 'bad_request' })
  expect(await action(b, 'setOptionPrice', { ...act, optionId: act2, pricePerPerson: 25 })).toMatchObject({ success: true })
  await expect(card(a, 'activities', 'Test activity 2')).toContainText('$25 / person (added by a member)', { timeout: 15_000 })

  // Never lockable; only the adder (or organizer) removes.
  expect(await action(a, 'lockBoard', act)).toMatchObject({ code: 'not_lockable' })
  expect(await action(b, 'removeOption', { ...act, optionId: act2 })).toMatchObject({ code: 'not_allowed' })

  // B marks vegetarian on their settings page; A sees the group's needs.
  await b.goto(`/trip/${tripId}/settings`)
  await b.getByTestId('diet-vegetarian').click({ timeout: 15_000 })
  await b.getByTestId('food-likes').fill('Thai')
  await b.getByTestId('save-food-prefs').click()
  await expect(b.getByText('Food preferences saved')).toBeVisible({ timeout: 15_000 })
  await expect(a.getByTestId('group-needs')).toContainText('vegetarian (1)', { timeout: 15_000 })

  // Food: suggestions use the group's needs; the place that doesn't confirm vegetarian gets the triangle and stays.
  await a.getByTestId('suggest-food').click()
  await expect(cards(a, 'food')).toHaveCount(10, { timeout: 30_000 })
  await expect(card(a, 'food', 'Test eatery 1').getByTestId('food-warning')).toHaveText('May not suit: vegetarian (1)')
  await expect(a.getByTestId('food-warning')).toHaveCount(1)
  // Anyone can add a place by name too.
  await a.getByTestId('add-input-food').fill('Corner diner')
  await a.getByTestId('add-food').click()
  await expect(cards(a, 'food')).toHaveCount(11, { timeout: 30_000 })

  // Food preferences are checked by the server.
  expect(await action(b, 'setMyFoodPrefs', { tripId, dietary: ['carnivore'] })).toMatchObject({ code: 'bad_request' })

  // Unlocking the dates leaves these lists alone.
  expect(await action(a, 'lockDates', { tripId, start: nextMonthDay(5), end: nextMonthDay(7) })).toMatchObject({ success: true })
  expect(await action(a, 'unlockDates', { tripId })).toMatchObject({ success: true })
  await a.reload()
  await expect(cards(a, 'activities')).toHaveCount(11, { timeout: 15_000 })
  await expect(cards(a, 'food')).toHaveCount(11)

  // The overview card shows the top activity and food with the triangle.
  await a.goto(`/trip/${tripId}`)
  await expect(a.getByTestId('additional-summary')).toContainText('Test activity 4', { timeout: 15_000 })
  // Leaderboards (redesign): every idea, ranked; the food place that may not suit someone keeps its ▲ warning.
  await expect(a.getByTestId('summary-activities').getByTestId('summary-tile')).toHaveCount(11)
  await expect(a.getByTestId('summary-food').getByTestId('summary-tile')).toHaveCount(11)
  // The place that accommodates nothing (the stand-in's first) is flagged.
  await expect(a.getByTestId('summary-food').getByTestId('summary-tile').filter({ has: a.getByText('Test eatery 1', { exact: true }) }).getByTestId('tile-warning')).toBeVisible()
  // An activity with no photo (the stand-in's 3rd result) shows the icon tile.
  await expect(a.getByTestId('summary-activities').locator('[data-testid="thumb"][data-fallback="true"]').first()).toBeVisible()

  // B leaves: B's food needs stop counting, so the warning goes away.
  expect(await action(b, 'leaveTrip', { tripId })).toMatchObject({ success: true })
  await a.goto(`/trip/${tripId}?section=additional`)
  await expect(a.getByTestId('group-needs')).toContainText('No dietary needs set.', { timeout: 15_000 })
  await expect(a.getByTestId('food-warning')).toHaveCount(0)
  expect(await action(b, 'setMyFoodPrefs', { tripId, dietary: [] })).toMatchObject({ code: 'not_a_member' })
})
