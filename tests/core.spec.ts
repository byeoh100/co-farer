/**
 * Module 1 (Core) — the "done when" list from PLAN.md §4.1, with two users.
 *
 *  1. A creates a trip, B joins by link and lands on settings, and the trip
 *     shows for B without a manual reload (join-refresh check, PLAN.md §2).
 *  2. B sets a private housing budget of $150: A sees no B budget anywhere.
 *  3. B makes gas public: A sees B's gas number next to B's name.
 *  4. A non-member calling setMyBudgets with A's tripId gets not_a_member.
 * Plus: the trip page frame (disabled sections + notice), leaving, and that
 * a non-member can't join the trip's presence room.
 */

import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 test accounts (see tests/collab.spec.ts).')

/** Calls a server action from inside the page, as that browser's user. */
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

test('Core: create, join, private and public budgets, non-member refused', async ({ users }) => {
  test.setTimeout(120_000)
  const [a, b] = await users(2)
  const tripName = `E2E trip ${Date.now().toString(36)}`

  // ── 1. A creates a trip ──
  await a.page.goto('/trips')
  await a.page.getByTestId('new-trip').click()
  await a.page.getByLabel('Trip name').fill(tripName)
  await a.page.getByLabel('Destination (optional)').fill('Cachuma Lake')
  await a.page.getByTestId('create-trip').click()
  await a.page.waitForURL(/\/trip\/[^/]+\/settings\?welcome=1/, { timeout: 20_000 })
  const tripId = new URL(a.page.url()).pathname.split('/')[2]
  await expect(a.page.getByRole('heading', { name: `Welcome to ${tripName}` })).toBeVisible({ timeout: 15_000 })
  await a.page.getByRole('link', { name: 'Skip for now' }).click()
  await expect(a.page.getByTestId('trip-name')).toHaveText(tripName, { timeout: 15_000 })

  // The frame: disabled sections show a notice instead of opening.
  // aria-disabled makes Playwright wait for "enabled"; a real click still fires, so force it.
  await a.page.getByTestId('section-housing').click({ force: true })
  await expect(a.page.getByText('This part isn’t ready yet.').first()).toBeVisible()

  // A (organizer) reads the invite link from the members panel.
  await a.page.getByTestId('members-stack').click()
  const inviteLink = await a.page.getByTestId('invite-link').inputValue()
  expect(inviteLink).toMatch(/\/join\/[A-Za-z0-9]{12}$/)
  await a.page.keyboard.press('Escape')

  // ── 4. B, not yet a member, is refused ──
  await b.page.goto('/trips')
  await expect(b.page.getByRole('heading', { name: 'My trips' })).toBeVisible({ timeout: 15_000 })
  const refused = await action(b.page, 'setMyBudgets', { tripId, housing: 1 })
  expect(refused).toMatchObject({ success: false, code: 'not_a_member' })
  const refusedLeave = await action(b.page, 'rotateInviteCode', { tripId })
  expect(refusedLeave).toMatchObject({ success: false, code: 'not_a_member' })
  // …and can't open the trip page.
  await b.page.goto(`/trip/${tripId}`)
  await expect(b.page.getByTestId('trip-not-found')).toBeVisible({ timeout: 15_000 })

  // ── 1. B joins by link, lands on settings, trip shows without a reload ──
  await b.page.goto(new URL(inviteLink).pathname)
  await expect(b.page.getByTestId('join-trip-name')).toHaveText(tripName, { timeout: 15_000 })
  await b.page.getByTestId('join-button').click()
  await b.page.waitForURL(new RegExp(`/trip/${tripId}/settings\\?welcome=1`), { timeout: 20_000 })
  await expect(b.page.getByRole('heading', { name: `Welcome to ${tripName}` })).toBeVisible({ timeout: 15_000 })

  // Joining twice is harmless.
  const again = await action(b.page, 'joinTrip', { inviteCode: new URL(inviteLink).pathname.split('/')[2] })
  expect(again).toMatchObject({ success: true })

  // ── 2. B sets a private housing budget of $150 ──
  await b.page.locator('#budget-housing-input').fill('150')
  await b.page.getByTestId('save-budgets').click()
  await b.page.waitForURL(new RegExp(`/trip/${tripId}$`), { timeout: 20_000 })
  await expect(b.page.getByTestId('my-essentials')).toContainText('Budget $150 · no estimates yet')

  // A sees B as a member, with no budget next to B's name.
  await a.page.reload()
  await a.page.getByTestId('members-stack').click({ timeout: 15_000 })
  const memberRows = a.page.getByTestId('member-row')
  await expect(memberRows).toHaveCount(2, { timeout: 15_000 })
  await expect(a.page.getByTestId('member-public-budgets')).toHaveCount(0)
  await expect(a.page.getByTestId('members-list')).not.toContainText('150')
  await a.page.keyboard.press('Escape')

  // Data level: `budgets` is read: 'own' for every role, pinned by src/schemas.test.ts.

  // ── 3. B makes gas public ──
  await b.page.goto(`/trip/${tripId}/settings`)
  await b.page.locator('#budget-gas-input').fill('40')
  await b.page.getByTestId('budget-gas-public').click()
  await b.page.getByTestId('save-budgets').click()
  await expect(b.page.getByText('Budgets saved')).toBeVisible({ timeout: 15_000 })

  await a.page.getByTestId('members-stack').click()
  await expect(a.page.getByTestId('member-public-budgets')).toHaveText('Gas $40', { timeout: 15_000 })
  await expect(a.page.getByTestId('members-list')).not.toContainText('150')
  await a.page.keyboard.press('Escape')

  // ── Leaving: B leaves; B's public gas disappears for A ──
  await b.page.getByTestId('leave-trip').click()
  await b.page.getByRole('button', { name: 'Leave trip' }).last().click()
  await b.page.waitForURL(/\/trips$/, { timeout: 20_000 })
  const afterLeave = await action(b.page, 'setMyBudgets', { tripId, housing: 1 })
  expect(afterLeave).toMatchObject({ success: false, code: 'not_a_member' })

  await a.page.getByTestId('members-stack').click()
  await expect(a.page.getByTestId('member-row')).toHaveCount(1, { timeout: 15_000 })
  await expect(a.page.getByTestId('member-public-budgets')).toHaveCount(0)

  // The organizer can't leave.
  const orgLeave = await action(a.page, 'leaveTrip', { tripId })
  expect(orgLeave).toMatchObject({ success: false, code: 'organizer_cannot_leave' })
})

test('Core: a non-member cannot join a trip presence room', async ({ users }) => {
  const [a, b] = await users(2)
  await a.page.goto('/trips')
  await expect(a.page.getByRole('heading', { name: 'My trips' })).toBeVisible({ timeout: 15_000 })
  const created = (await action(a.page, 'createTrip', { name: 'Presence check' })) as { success: boolean; data: { tripId: string } }
  expect(created.success).toBe(true)

  await b.page.goto('/trips')
  await expect(b.page.getByRole('heading', { name: 'My trips' })).toBeVisible({ timeout: 15_000 })
  const outcome = async (page: Page) =>
    page.evaluate(async (tripId) => {
      const t = await fetch('/api/auth/token', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      const { token } = (await t.json()) as { token: string }
      return new Promise<string>((resolve) => {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
        const ws = new WebSocket(`${proto}//${location.host}/ws/presence/${encodeURIComponent(`trip:${tripId}`)}?token=${token}`)
        ws.onopen = () => {
          ws.close()
          resolve('open')
        }
        ws.onerror = () => resolve('refused')
        setTimeout(() => resolve('timeout'), 8000)
      })
    }, created.data.tripId)

  expect(await outcome(a.page)).toBe('open')
  expect(await outcome(b.page)).toBe('refused')
})

test('Core: choosing a profile picture opens the centering pop-up', async ({ users }) => {
  const [a] = await users(1)
  await a.page.goto('/settings')
  await expect(a.page.getByRole('heading', { name: 'Profile' })).toBeVisible({ timeout: 15_000 })
  // A tiny PNG. (Test accounts have no file storage, so the upload itself isn't checked here.)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await a.page.getByTestId('picture-input').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png })
  await expect(a.page.getByRole('heading', { name: 'Center your picture' })).toBeVisible()
  await a.page.getByTestId('cropper-zoom').fill('2')
  const box = (await a.page.getByTestId('cropper').boundingBox())!
  await a.page.mouse.move(box.x + 120, box.y + 120)
  await a.page.mouse.down()
  await a.page.mouse.move(box.x + 160, box.y + 140)
  await a.page.mouse.up()
  await a.page.getByTestId('cropper-done').click()
  await expect(a.page.getByRole('heading', { name: 'Center your picture' })).toHaveCount(0)
})

test('Core: a saved profile (name + picture) sticks and shows in trips', async ({ users }) => {
  const [a] = await users(1)
  await a.page.goto('/trips')
  await expect(a.page.getByRole('heading', { name: 'My trips' })).toBeVisible({ timeout: 15_000 })
  const custom = `Al ${Date.now().toString(36)}`
  const pic = '/api/files/app/avatars/test.jpg?scope=app'
  const trip = (await action(a.page, 'createTrip', { name: 'Profile check' })) as { data: { tripId: string } }
  // Regression: name and imageUrl on `users` are system-managed, so saving
  // there failed with a picture and silently did nothing for a new name.
  expect(await action(a.page, 'updateMyProfile', { name: custom, imageUrl: pic })).toMatchObject({ success: true })
  expect(await action(a.page, 'updateMyProfile', { name: custom, imageUrl: 'https://evil.example/p.png' })).toMatchObject({ success: false })

  await a.page.goto('/settings')
  await expect(a.page.getByTestId('profile-name')).toHaveValue(custom, { timeout: 15_000 })

  await a.page.goto(`/trip/${trip.data.tripId}`)
  await a.page.getByTestId('members-stack').click({ timeout: 15_000 })
  await expect(a.page.getByTestId('member-name')).toHaveText(custom)
  // The picture link reached the trip's member row…
  await expect(a.page.getByTestId('members-list').locator(`[data-image="${pic}"]`)).toHaveCount(1)
  // …and since that file doesn't exist, the avatar falls back to the letter.
  await expect(a.page.getByTestId('members-list').locator(`img[src="${pic}"]`)).toHaveCount(0)
  await expect(a.page.getByTestId('members-list').getByText(custom[0].toUpperCase(), { exact: true })).toBeVisible()

  // Leave the shared test account as it was: real name, no picture.
  expect(await action(a.page, 'updateMyProfile', { name: a.name || 'Alice', imageUrl: null })).toMatchObject({ success: true })
})

test('Core: invite link copies on the first open, even if the clipboard API refuses', async ({ users }) => {
  const [a] = await users(1)
  await a.context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await a.page.goto('/trips')
  await expect(a.page.getByRole('heading', { name: 'My trips' })).toBeVisible({ timeout: 15_000 })
  const trip = (await action(a.page, 'createTrip', { name: 'Copy check' })) as { data: { tripId: string } }
  await a.page.goto(`/trip/${trip.data.tripId}`)
  // Simulate a browser that rejects navigator.clipboard.writeText (seen in a
  // real browser on the first open of the members panel).
  await a.page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError'))
  })
  await a.page.getByTestId('members-stack').click({ timeout: 15_000 })
  const link = await a.page.getByTestId('invite-link').inputValue()
  await a.page.getByRole('button', { name: 'Copy invite link' }).click()
  await expect(a.page.getByText('Could not copy')).toHaveCount(0)
  expect(await a.page.evaluate(() => navigator.clipboard.readText())).toBe(link)
})
