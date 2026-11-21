/**
 * Module 2 (Dates): the "done when" list from PLAN.md §4.2, with two users.
 *  - Two users add ranges and the per-day counts (and circles) match in both browsers.
 *  - The organizer locks, and the date bar shows the locked dates for both.
 *  - A member calling lockDates is refused.
 * Plus the decisions: your overlapping ranges blend; availability is
 * read-only while locked; unlocking reopens; leaving removes your dates.
 */

import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 test accounts (see tests/collab.spec.ts).')

async function action(page: Page, name: string, params: Record<string, unknown>) {
  return page.evaluate(
    async ({ name, params }) => {
      const t = await fetch('/api/auth/token', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      const { token } = (await t.json()) as { token: string }
      const res = await fetch(`/api/actions/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(params),
      })
      return (await res.json()) as { success: boolean; code?: string; data?: unknown }
    },
    { name, params },
  )
}

/** Day `d` of next month as YYYY-MM-DD (always in the future). */
function nextMonthDay(d: number): string {
  const now = new Date()
  const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const m = ((now.getMonth() + 1) % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

async function openCalendarOnNextMonth(page: Page) {
  await page.getByTestId('dates-bar').click()
  await expect(page.getByTestId('dates-calendar')).toBeVisible()
  await page.getByRole('button', { name: 'Next month' }).click()
}

async function selectRange(page: Page, start: string, end: string) {
  await page.getByTestId(`day-${start}`).click()
  await page.getByTestId(`day-${end}`).click()
}

test('Dates: ranges, matching heatmap, lock, refusals, unlock, leave', async ({ users }) => {
  test.setTimeout(120_000)
  const [a, b] = await users(2)

  // Setup: A organizes, B joins by link.
  await a.page.goto('/trips')
  await expect(a.page.getByRole('heading', { name: 'My trips' })).toBeVisible({ timeout: 15_000 })
  const created = (await action(a.page, 'createTrip', { name: 'Dates check' })) as { data: { tripId: string } }
  const tripId = created.data.tripId
  await a.page.goto(`/trip/${tripId}`)
  await a.page.getByTestId('members-stack').click({ timeout: 15_000 })
  const invite = new URL(await a.page.getByTestId('invite-link').inputValue()).pathname
  await a.page.keyboard.press('Escape')
  await b.page.goto(invite)
  await b.page.getByTestId('join-button').click({ timeout: 15_000 })
  await b.page.waitForURL(/settings\?welcome=1/, { timeout: 20_000 })
  await b.page.goto(`/trip/${tripId}`)

  await expect(a.page.getByTestId('dates-summary')).toHaveText(/Not locked yet/, { timeout: 15_000 })

  // A: 10–14; B: 12–16 (next month). Overlap 12–14 = 2 people.
  await openCalendarOnNextMonth(a.page)
  await selectRange(a.page, nextMonthDay(10), nextMonthDay(14))
  await a.page.getByTestId('add-range').click()
  await expect(a.page.getByTestId('my-ranges').locator('li')).toHaveCount(1)

  await openCalendarOnNextMonth(b.page)
  await selectRange(b.page, nextMonthDay(12), nextMonthDay(16))
  await b.page.getByTestId('add-range').click()

  // Heatmap counts match in both browsers, live.
  const expected: Record<number, string> = { 9: '0', 10: '1', 12: '2', 14: '2', 15: '1', 16: '1', 17: '0' }
  for (const page of [a.page, b.page]) {
    for (const [d, n] of Object.entries(expected)) {
      await expect(page.getByTestId(`day-${nextMonthDay(Number(d))}`)).toHaveAttribute('data-free', n, { timeout: 15_000 })
    }
  }

  // Each day shows the circles of the people free that day.
  for (const page of [a.page, b.page]) {
    await expect(page.getByTestId(`day-${nextMonthDay(13)}`).locator('span[title]')).toHaveCount(2)
    await expect(page.getByTestId(`day-${nextMonthDay(10)}`).locator('span[title]')).toHaveCount(1)
    await expect(page.getByTestId(`day-${nextMonthDay(9)}`).locator('span[title]')).toHaveCount(0)
  }

  // Tapping a day shows who's free.
  await b.page.getByTestId(`day-${nextMonthDay(13)}`).click()
  await expect(b.page.getByTestId('day-detail')).toContainText('2 of 2 free')
  await b.page.getByRole('button', { name: 'Clear' }).click()

  // A's overlapping range blends into one: 10–14 + 14–18 → 10–18.
  await selectRange(a.page, nextMonthDay(14), nextMonthDay(18))
  await a.page.getByTestId('add-range').click()
  await expect(a.page.getByTestId('my-ranges').locator('li')).toHaveCount(1, { timeout: 15_000 })
  await expect(a.page.getByTestId(`day-${nextMonthDay(17)}`)).toHaveAttribute('data-free', '1')

  // A member can't lock.
  const refused = await action(b.page, 'lockDates', { tripId, start: nextMonthDay(12), end: nextMonthDay(14) })
  expect(refused).toMatchObject({ success: false, code: 'not_organizer' })
  await expect(b.page.getByTestId('mode-final')).toHaveCount(0)

  // The organizer picks final dates and locks; both date bars show them.
  await a.page.getByTestId('mode-final').click()
  await selectRange(a.page, nextMonthDay(12), nextMonthDay(14))
  await a.page.getByTestId('lock-dates').click()
  await expect(a.page.getByText('Dates locked')).toBeVisible({ timeout: 15_000 })
  await a.page.keyboard.press('Escape')
  await b.page.keyboard.press('Escape')
  for (const [who, page] of [['A', a.page], ['B', b.page]] as const) {
    await expect(page.getByTestId('dates-summary'), `${who}'s date bar`).toContainText('Locked · 2 of 2 free', { timeout: 15_000 })
  }

  // Availability is read-only while locked.
  const whileLocked = await action(b.page, 'addAvailability', { tripId, start: nextMonthDay(20), end: nextMonthDay(21) })
  expect(whileLocked).toMatchObject({ success: false, code: 'dates_locked' })

  // Unlock (with confirmation) reopens for both.
  await a.page.getByTestId('dates-bar').click()
  await a.page.getByTestId('unlock-dates').click()
  await a.page.getByRole('button', { name: 'Unlock dates' }).last().click()
  for (const page of [a.page, b.page]) {
    await expect(page.getByTestId('dates-summary')).toHaveText(/Not locked yet/, { timeout: 15_000 })
  }

  // B leaves: B's dates stop counting.
  expect(await action(b.page, 'leaveTrip', { tripId })).toMatchObject({ success: true })
  await a.page.getByTestId('dates-bar').click()
  await a.page.getByRole('button', { name: 'Next month' }).click()
  await expect(a.page.getByTestId(`day-${nextMonthDay(16)}`)).toHaveAttribute('data-free', '1', { timeout: 15_000 })
  await expect(a.page.getByTestId(`day-${nextMonthDay(13)}`)).toHaveAttribute('data-free', '1')
})

test('Dates: the server refuses bad ranges and other people’s ranges', async ({ users }) => {
  const [a, b] = await users(2)
  await a.page.goto('/trips')
  await expect(a.page.getByRole('heading', { name: 'My trips' })).toBeVisible({ timeout: 15_000 })
  const { data } = (await action(a.page, 'createTrip', { name: 'Dates refusals' })) as { data: { tripId: string } }
  const tripId = data.tripId

  for (const bad of [
    { start: nextMonthDay(14), end: nextMonthDay(10) }, // reversed
    { start: '2020-01-01', end: '2020-01-05' }, // past
    { start: nextMonthDay(1), end: '2099-01-01' }, // too long
    { start: 'soon', end: nextMonthDay(2) }, // not a date
  ]) {
    expect(await action(a.page, 'addAvailability', { tripId, ...bad })).toMatchObject({ success: false, code: 'bad_request' })
  }

  const added = (await action(a.page, 'addAvailability', { tripId, start: nextMonthDay(3), end: nextMonthDay(4) })) as {
    data: { rangeId: string }
  }
  // B isn't a member: refused before anything else.
  await b.page.goto('/trips')
  await expect(b.page.getByRole('heading', { name: 'My trips' })).toBeVisible({ timeout: 15_000 })
  expect(await action(b.page, 'removeAvailability', { tripId, rangeId: added.data.rangeId })).toMatchObject({ code: 'not_a_member' })
  expect(await action(b.page, 'addAvailability', { tripId, start: nextMonthDay(3), end: nextMonthDay(4) })).toMatchObject({ code: 'not_a_member' })
})
