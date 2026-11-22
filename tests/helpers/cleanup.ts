/**
 * After each test, every test account deletes the trips it organizes that
 * are over 15 minutes old (`cleanupMyTestTrips`, local test accounts only).
 * Recent trips are left alone because tests run in parallel. Without this, accounts
 * pile up trips across runs, and past ~100 trips DeepSpace's team read rule
 * hits SQLite's variable limit and trip pages stop loading.
 */

import { loadAllTestAccounts } from 'deepspace/testing'
import type { MultiplayerUser } from 'deepspace/testing'

type UsersFixture = (n: number) => Promise<MultiplayerUser[]>

export async function cleanupTestTrips({ users }: { users: UsersFixture }) {
  const all = await users(Math.min(loadAllTestAccounts().length, 3))
  for (const u of all) {
    await u.page.goto('/')
    const res = await u.page.evaluate(async () => {
      const t = await fetch('/api/auth/token', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      const { token } = (await t.json()) as { token: string }
      const r = await fetch('/api/actions/cleanupMyTestTrips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
      })
      return (await r.json()) as { success: boolean; error?: string }
    })
    if (!res.success) throw new Error(`cleanupMyTestTrips failed for ${u.email}: ${res.error}`)
  }
}
