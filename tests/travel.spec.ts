/**
 * Module 4 (Transportation): the "done when" list from PLAN.md §4.4, with
 * three users.
 *  - A drives and B claims a seat; both see it live.
 *  - The car shows full at capacity.
 *  - B switches to flying and the seat frees up.
 * Plus the human's decisions: the driver can remove a rider and riders can
 * leave; pickup notes are seen only by that car; "another way" has a
 * dropdown and from/to dates. And the server rules: the last-seat race,
 * seats below riders, non-members, leaving.
 */

import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { cleanupTestTrips } from './helpers/cleanup'

test.skip(loadAllTestAccounts().length < 3, 'Needs 3 test accounts (alice/bob/carol-cofarer@deepspace.test).')

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

async function setupTrip(users: Page[]) {
  const [a, ...rest] = users
  for (const p of users) {
    await p.goto('/trips')
    await expect(p.getByRole('heading', { name: 'My trips' })).toBeVisible({ timeout: 15_000 })
  }
  const created = await action(a, 'createTrip', { name: `Travel ${Date.now().toString(36)}`, destination: 'Cachuma Lake' })
  const tripId = created.data!.tripId as string
  await a.goto(`/trip/${tripId}`)
  await a.getByTestId('members-stack').click({ timeout: 15_000 })
  const code = new URL(await a.getByTestId('invite-link').inputValue()).pathname.split('/')[2]
  await a.keyboard.press('Escape')
  for (const p of rest) expect(await action(p, 'joinTrip', { inviteCode: code })).toMatchObject({ success: true })
  return tripId
}

const car = (p: Page) => p.locator('[data-testid="car"]').first()

test('Travel: drive, claim live, full, pickup notes, fly frees the seat, remove, leave', async ({ users }) => {
  test.setTimeout(180_000)
  const [a, b, c] = (await users(3)).map((u) => u.page)
  const tripId = await setupTrip([a, b, c])
  const t = { tripId }

  // Travel is open right away (no locked dates needed); the organizer sets a meeting point.
  expect(await action(a, 'updateTrip', { ...t, name: 'Travel check', destination: 'Cachuma Lake', meetingPoint: 'Campus' })).toMatchObject({ success: true })
  await a.goto(`/trip/${tripId}?section=travel`)
  await expect(a.getByTestId('meeting-point')).toContainText('Campus', { timeout: 15_000 })

  // A drives with 2 passenger seats (in the UI).
  await a.getByTestId('mode-driving').click()
  await a.getByTestId('travel-seats').fill('2')
  await a.getByTestId('save-travel').click()
  await expect(car(a)).toContainText('Your car', { timeout: 15_000 })
  await expect(a.getByTestId('car-group').first()).toContainText('From Campus')
  await expect(car(a).getByTestId('seats-left')).toHaveText('2 of 2 seats left')
  // Saving the same again returns A's id (used for the direct action calls below).
  const driverUserId = (await action(a, 'setMyTravel', { ...t, mode: 'driving', seats: 2 })).data!.userId as string

  // B taps the car to take a seat; both see it live.
  await b.goto(`/trip/${tripId}?section=travel`)
  await car(b).getByTestId('claim-seat').click({ timeout: 15_000 })
  await expect(car(a).getByTestId('seats-left')).toHaveText('1 of 2 seats left', { timeout: 15_000 })
  await expect(car(b).getByTestId('seats-left')).toHaveText('1 of 2 seats left')

  // B's pickup note reaches the driver.
  await b.getByTestId('pickup-input').fill('123 Del Playa Dr')
  await b.getByTestId('save-pickup').click()
  await expect(car(a).getByTestId('pickups')).toContainText('Pickup: 123 Del Playa Dr', { timeout: 15_000 })

  // A can't drop below the riders already in the car.
  expect(await action(a, 'setMyTravel', { ...t, mode: 'driving', seats: 0 })).toMatchObject({ code: 'bad_request' })

  // C fills the last seat: the car shows full for everyone; C (in the car) sees B's note.
  expect(await action(c, 'claimSeat', { ...t, driverUserId: driverUserId })).toMatchObject({ success: true })
  await expect(car(a).getByTestId('car-full')).toBeVisible({ timeout: 15_000 })
  await expect(car(b).getByTestId('car-full')).toBeVisible({ timeout: 15_000 })
  await c.goto(`/trip/${tripId}?section=travel`)
  await expect(car(c).getByTestId('pickups')).toContainText('123 Del Playa Dr', { timeout: 15_000 })

  // B switches to flying, with the dropdown and from/to dates: the seat frees up.
  await b.getByTestId('mode-other').click()
  await b.getByTestId('travel-kind').selectOption('flight')
  await b.getByTestId('travel-details').fill('UA 512, lands SBA 3pm')
  await b.getByTestId('save-travel').click()
  await expect(car(a).getByTestId('seats-left')).toHaveText('1 of 2 seats left', { timeout: 15_000 })
  await expect(a.getByTestId('other-traveler')).toContainText('Flight', { timeout: 15_000 })
  await expect(a.getByTestId('other-traveler')).toContainText('UA 512, lands SBA 3pm')
  // B, no longer in the car, can't read its pickup notes.
  expect(await action(b, 'getCarPickups', { ...t, driverUserId: driverUserId })).toMatchObject({ code: 'not_in_car' })

  // The driver takes C out of the car (with a confirm): C is back to not decided.
  await car(a).getByTestId('remove-rider').click()
  await a.getByRole('button', { name: 'Remove' }).last().click()
  await expect(car(a).getByTestId('seats-left')).toHaveText('2 of 2 seats left', { timeout: 15_000 })
  await expect(a.getByTestId('undecided')).toBeVisible({ timeout: 15_000 })

  // C takes a seat again and leaves it themselves.
  await car(c).getByTestId('claim-seat').click({ timeout: 15_000 })
  await expect(car(a).getByTestId('seats-left')).toHaveText('1 of 2 seats left', { timeout: 15_000 })
  await c.getByTestId('leave-seat').click()
  await expect(car(a).getByTestId('seats-left')).toHaveText('2 of 2 seats left', { timeout: 15_000 })

  // C rides again, then leaves the trip: the seat frees up.
  expect(await action(c, 'claimSeat', { ...t, driverUserId: driverUserId })).toMatchObject({ success: true })
  await expect(car(a).getByTestId('seats-left')).toHaveText('1 of 2 seats left', { timeout: 15_000 })
  expect(await action(c, 'leaveTrip', t)).toMatchObject({ success: true })
  await expect(car(a).getByTestId('seats-left')).toHaveText('2 of 2 seats left', { timeout: 15_000 })

  // A stops driving: the car is gone.
  expect(await action(a, 'setMyTravel', { ...t, mode: 'undecided' })).toMatchObject({ success: true })
  await expect(a.getByTestId('car')).toHaveCount(0, { timeout: 15_000 })
})

test('Travel: the last-seat race, seats below riders, and the server refusals', async ({ users }) => {
  test.setTimeout(120_000)
  const [a, b, c] = (await users(3)).map((u) => u.page)
  const tripId = await setupTrip([a, b, c])
  const t = { tripId }
  const driverUserId = (await action(a, 'setMyTravel', { ...t, mode: 'driving', seats: 1 })).data!.userId as string

  // B and C grab the only seat at the same moment: exactly one gets it.
  const [rb, rc] = await Promise.all([action(b, 'claimSeat', { ...t, driverUserId }), action(c, 'claimSeat', { ...t, driverUserId })])
  expect([rb.success, rc.success].filter(Boolean)).toHaveLength(1)
  expect([rb, rc].find((r) => !r.success)).toMatchObject({ code: 'car_full' })
  const loser = rb.success ? c : b
  const winnerId = ((rb.success ? rb : rc).data!.userId) as string

  // The driver can't lower seats below the riders (raise to 2, take a second rider, try 1).
  expect(await action(a, 'setMyTravel', { ...t, mode: 'driving', seats: 2 })).toMatchObject({ success: true })
  expect(await action(loser, 'claimSeat', { ...t, driverUserId })).toMatchObject({ success: true })
  expect(await action(a, 'setMyTravel', { ...t, mode: 'driving', seats: 1 })).toMatchObject({ code: 'seats_below_riders' })

  // Riding is set by claiming, not directly; a driver can't claim; bad input is refused.
  expect(await action(b, 'setMyTravel', { ...t, mode: 'riding' })).toMatchObject({ code: 'bad_request' })
  expect(await action(a, 'claimSeat', { ...t, driverUserId })).toMatchObject({ code: 'bad_request' })
  expect(await action(b, 'setMyTravel', { ...t, mode: 'other', otherKind: 'flight', fromDate: '2027-03-21', toDate: '2027-03-19' })).toMatchObject({ code: 'bad_request' })

  // Only the driver (or the rider) can release a seat.
  // (The two riders try to release each other.)
  const winner = rb.success ? b : c
  const loserId = (await action(loser, 'claimSeat', { ...t, driverUserId })).data!.userId as string
  expect(await action(winner, 'releaseSeat', { ...t, riderUserId: loserId })).toMatchObject({ code: 'not_found' })
  expect(await action(loser, 'releaseSeat', { ...t, riderUserId: winnerId })).toMatchObject({ code: 'not_found' })

  // A stops driving: both riders are released.
  expect(await action(a, 'setMyTravel', { ...t, mode: 'undecided' })).toMatchObject({ success: true })
  expect(await action(b, 'setPickupNote', { ...t, note: 'here' })).toMatchObject({ code: 'no_seat' })
  expect(await action(c, 'setPickupNote', { ...t, note: 'here' })).toMatchObject({ code: 'no_seat' })

  // A non-member is refused before anything else.
  const other = await setupTrip([c])
  expect(await action(b, 'setMyTravel', { tripId: other, mode: 'undecided' })).toMatchObject({ code: 'not_a_member' })
  expect(await action(b, 'getCarPickups', { tripId: other, driverUserId })).toMatchObject({ code: 'not_a_member' })
})
