/**
 * Module 5 (Notes): the "done when" list from PLAN.md §4.5, with two users.
 *  - Add, edit and delete work live across two browsers.
 *  - B leaves: B's notes gray out but stay.
 *  - The organizer removes one.
 * Plus the server rules: only your own notes can be edited or deleted,
 * only the organizer removes others', non-members are refused, 280 chars.
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

const note = (p: Page, text: string) => p.locator('[data-testid="note"]').filter({ hasText: text })

test('Notes: live add, edit, delete; B leaves and B’s notes gray out; organizer removes one', async ({ users }) => {
  test.setTimeout(120_000)
  const [a, b] = (await users(2)).map((u) => u.page)
  for (const p of [a, b]) {
    await p.goto('/trips')
    await expect(p.getByRole('heading', { name: 'Where to next?' })).toBeVisible({ timeout: 15_000 })
  }
  const tripId = (await action(a, 'createTrip', { name: `Notes ${Date.now().toString(36)}`, destination: 'Cachuma Lake' })).data!.tripId as string
  await a.goto(`/trip/${tripId}`)
  await a.getByTestId('members-stack').click({ timeout: 15_000 })
  const code = new URL(await a.getByTestId('invite-link').inputValue()).pathname.split('/')[2]
  await a.keyboard.press('Escape')
  expect(await action(b, 'joinTrip', { inviteCode: code })).toMatchObject({ success: true })

  // Notes is open right away; both on the board.
  await a.goto(`/trip/${tripId}?section=notes`)
  await b.goto(`/trip/${tripId}?section=notes`)
  await expect(b.getByTestId('notes-full')).toBeVisible({ timeout: 15_000 })

  // A adds a note; B sees it live.
  await a.getByTestId('note-input').fill('I’m bringing the speaker')
  await a.getByTestId('add-note').click()
  await expect(note(b, 'I’m bringing the speaker')).toBeVisible({ timeout: 15_000 })

  // B adds two; newest first for A.
  for (const text of ['Who has a cooler?', 'I can bring a tent']) {
    await b.getByTestId('note-input').fill(text)
    await b.getByTestId('add-note').click()
    await expect(note(b, text)).toBeVisible({ timeout: 15_000 })
  }
  await expect(a.getByTestId('note-text').first()).toHaveText('I can bring a tent', { timeout: 15_000 })

  // B edits their own note; A sees the change and "edited".
  await note(b, 'Who has a cooler?').getByTestId('note-edit').click()
  await b.getByTestId('note-edit-input').fill('Who has a big cooler?')
  await b.getByTestId('note-save').click()
  await expect(note(a, 'Who has a big cooler?')).toContainText('edited', { timeout: 15_000 })

  // A can't edit or delete B's note; B can't remove A's (organizer only).
  const ids = await noteIds(a)
  const bNoteId = ids.find((x) => x.text === 'I can bring a tent')!.id
  const aNoteId = ids.find((x) => x.text === 'I’m bringing the speaker')!.id
  expect(await action(a, 'editNote', { tripId, noteId: bNoteId, text: 'hacked' })).toMatchObject({ code: 'not_found' })
  expect(await action(a, 'deleteNote', { tripId, noteId: bNoteId })).toMatchObject({ code: 'not_found' })
  expect(await action(b, 'removeNote', { tripId, noteId: aNoteId })).toMatchObject({ code: 'not_organizer' })
  // B's board shows edit/delete only on B's notes.
  await expect(note(b, 'I’m bringing the speaker').getByTestId('note-delete')).toHaveCount(0)
  expect(await action(b, 'addNote', { tripId, text: 'x'.repeat(281) })).toMatchObject({ code: 'bad_request' })

  // A deletes their own note; it's gone for B.
  await note(a, 'I’m bringing the speaker').getByTestId('note-delete').click()
  await a.getByRole('button', { name: 'Delete' }).last().click()
  await expect(note(b, 'I’m bringing the speaker')).toHaveCount(0, { timeout: 15_000 })

  // B leaves: B's notes stay, grayed out and marked.
  expect(await action(b, 'leaveTrip', { tripId })).toMatchObject({ success: true })
  await expect(note(a, 'I can bring a tent')).toHaveAttribute('data-left', 'true', { timeout: 15_000 })
  await expect(note(a, 'I can bring a tent').getByTestId('note-left')).toHaveText(' · has left')
  await expect(a.getByTestId('note')).toHaveCount(2)
  // B, no longer a member, is refused.
  expect(await action(b, 'addNote', { tripId, text: 'still here?' })).toMatchObject({ code: 'not_a_member' })

  // The organizer removes one of B's grayed-out notes.
  await note(a, 'I can bring a tent').getByTestId('note-delete').click()
  await a.getByRole('button', { name: 'Remove' }).last().click()
  await expect(note(a, 'I can bring a tent')).toHaveCount(0, { timeout: 15_000 })
  await expect(a.getByTestId('note')).toHaveCount(1)

  // The overview card shows the count and the latest note.
  await a.keyboard.press('Escape')
  await expect(a.getByTestId('notes-summary')).toContainText('1 note', { timeout: 15_000 })
})

/** Note ids and texts, read through the page's own live records. */
async function noteIds(page: Page): Promise<Array<{ id: string; text: string }>> {
  return page.locator('[data-testid="note"]').evaluateAll((els) =>
    els.map((el) => ({ id: el.getAttribute('data-note-id') ?? '', text: el.querySelector('[data-testid="note-text"]')?.textContent ?? '' })),
  )
}
