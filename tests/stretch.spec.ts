/**
 * Stretch goals, with two users:
 *  - Gas: the organizer adds the one-way miles and gas price; each car
 *    shows the per-person share, and it becomes each rider's gas estimate
 *    on their own settings page, checked against their gas budget.
 *  - Best window: in "Final dates", the organizer enters a trip length and
 *    the best stretches are marked; tapping one selects it to lock.
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

async function setupTrip(a: Page, b: Page) {
  for (const p of [a, b]) {
    await p.goto('/trips')
    await expect(p.getByRole('heading', { name: 'My trips' })).toBeVisible({ timeout: 15_000 })
  }
  const tripId = (await action(a, 'createTrip', { name: `Stretch ${Date.now().toString(36)}`, destination: 'Cachuma Lake' })).data!.tripId as string
  await a.goto(`/trip/${tripId}`)
  await a.getByTestId('members-stack').click({ timeout: 15_000 })
  const code = new URL(await a.getByTestId('invite-link').inputValue()).pathname.split('/')[2]
  await a.keyboard.press('Escape')
  expect(await action(b, 'joinTrip', { inviteCode: code })).toMatchObject({ success: true })
  return tripId
}

test('Gas: miles and price → per-person share per car → the rider’s gas estimate', async ({ users }) => {
  test.setTimeout(120_000)
  const [a, b] = (await users(2)).map((u) => u.page)
  const tripId = await setupTrip(a, b)
  const t = { tripId }

  // A drives (30 mpg); B rides.
  const driverUserId = (await action(a, 'setMyTravel', { ...t, mode: 'driving', seats: 2, mpg: 30 })).data!.userId as string
  expect(await action(b, 'claimSeat', { ...t, driverUserId })).toMatchObject({ success: true })

  // No miles yet: no gas line. Only the organizer can set them.
  await a.goto(`/trip/${tripId}?section=travel`)
  await expect(a.getByTestId('gas-summary')).toContainText('Add the trip distance', { timeout: 15_000 })
  await expect(a.getByTestId('car-gas')).toHaveCount(0)
  expect(await action(b, 'setTripGas', { ...t, miles: 150 })).toMatchObject({ code: 'not_organizer' })
  expect(await action(a, 'setTripGas', { ...t, miles: 0 })).toMatchObject({ code: 'bad_request' })

  // A adds 150 miles at $5: 2 × 150 ÷ 30 × $5 ÷ 2 people = $25 each.
  await a.getByTestId('edit-gas').click()
  await a.getByTestId('gas-miles').fill('150')
  await a.getByTestId('gas-price').fill('5.00')
  await a.getByTestId('save-gas').click()
  await expect(a.getByTestId('gas-summary')).toContainText('150 miles each way · $5.00/gal', { timeout: 15_000 })
  await expect(a.getByTestId('car-gas')).toContainText('Gas ≈ $25 each (2 people, round trip, 30 mpg)')

  // B sees it on the board and as their own gas estimate, over their $20 gas budget.
  await b.goto(`/trip/${tripId}?section=travel`)
  await expect(b.getByTestId('car-gas')).toContainText('$25 each', { timeout: 15_000 })
  expect(await action(b, 'setMyBudgets', { tripId, gas: 20 })).toMatchObject({ success: true })
  await b.goto(`/trip/${tripId}/settings`)
  await expect(b.getByTestId('budget-gas')).toContainText('Estimate: $25', { timeout: 15_000 })
  await expect(b.getByTestId('budget-gas')).toContainText('over budget')

  // B leaves the car: A drives alone, so A's share is the whole $50.
  expect(await action(b, 'releaseSeat', t)).toMatchObject({ success: true })
  await expect(a.getByTestId('car-gas')).toContainText('Gas ≈ $50 each (1 person', { timeout: 15_000 })
})

test('Best window: the organizer’s helper marks the best stretch and selects it', async ({ users }) => {
  test.setTimeout(120_000)
  const [a, b] = (await users(2)).map((u) => u.page)
  const tripId = await setupTrip(a, b)
  // A: 10–14, B: 12–16 (next month). Best 2-night window: 12–14, both free every day.
  expect(await action(a, 'addAvailability', { tripId, start: nextMonthDay(10), end: nextMonthDay(14) })).toMatchObject({ success: true })
  expect(await action(b, 'addAvailability', { tripId, start: nextMonthDay(12), end: nextMonthDay(16) })).toMatchObject({ success: true })

  // Members don't get the helper (it's in the organizer's Final dates mode).
  await b.goto(`/trip/${tripId}`)
  await b.getByTestId('dates-bar').click({ timeout: 15_000 })
  await expect(b.getByTestId('best-window')).toHaveCount(0)

  await a.goto(`/trip/${tripId}`)
  await a.getByTestId('dates-bar').click({ timeout: 15_000 })
  await a.getByTestId('mode-final').click()
  await a.getByTestId('best-window-toggle').click()
  await a.getByTestId('best-window-nights').fill('2')
  const first = a.getByTestId('best-window-option').first()
  await expect(first).toContainText('2 of 2 free every day', { timeout: 15_000 })

  // Tapping it jumps to its month, marks it, and selects it, ready to lock.
  await first.click()
  await expect(a.getByTestId(`day-${nextMonthDay(12)}`)).toHaveAttribute('data-best', '1')
  await expect(a.getByTestId(`day-${nextMonthDay(14)}`)).toHaveAttribute('data-best', '1')
  await expect(a.getByTestId(`day-${nextMonthDay(15)}`)).not.toHaveAttribute('data-best', '1')
  await expect(a.getByTestId('selection-bar')).toBeVisible()
  await a.getByTestId('lock-dates').click()
  await a.keyboard.press('Escape')
  await expect(a.getByTestId('dates-summary')).toContainText('Locked · 2 of 2 free', { timeout: 15_000 })
})
