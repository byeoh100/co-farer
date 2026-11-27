/**
 * After each test, every test account deletes the trips it organizes that
 * are over 15 minutes old (`cleanupMyTestTrips`, local servers only).
 * Recent trips are left alone because tests run in parallel. Each Playwright
 * run starts from an empty data folder, so this matters only for long local
 * runs against a kept folder: past ~100 trips the team read rule hits
 * SQLite's variable limit and trip pages stop loading (PLAN.md §2).
 */

import type { TestUser } from './fixtures'

type UsersFixture = (n: number) => Promise<TestUser[]>

export async function cleanupTestTrips({ users }: { users: UsersFixture }) {
  const all = await users(3)
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
