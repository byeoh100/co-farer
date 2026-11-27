/**
 * The `users` fixture for plain Playwright (docs/MIGRATION.md, Phase 2e),
 * replacing `deepspace/testing`. Same shape, so specs read the same:
 *
 *   const [a, b] = await users(2)        // Alice and Bob, each in their own browser
 *   const [c] = await users(['Carol'])   // by name
 *
 * Each user signs in through the test-only route (src/server/test-auth.ts),
 * which the test server enables with ALLOW_TEST_AUTH=true. Users are fixed
 * identities (`test-alice`, …, `@deepspace.test`, so research uses the free
 * local AI stand-in); within one test, asking again returns the same browsers.
 */

import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'

export interface TestUser {
  context: BrowserContext
  page: Page
  email: string
  name: string
  userId: string
}

const ACCOUNTS = ['Alice', 'Bob', 'Carol', 'Dave'] as const

/** The pool of test accounts (fixed; every run has all of them). */
export function loadAllTestAccounts() {
  return ACCOUNTS.map((name) => ({ name, email: `${name.toLowerCase()}@deepspace.test` }))
}

type UsersFixture = (selector: number | string[]) => Promise<TestUser[]>

export const test = base.extend<{ users: UsersFixture }>({
  users: async ({ browser }, provide) => {
    const open = new Map<string, TestUser>()
    const signIn = async (name: string): Promise<TestUser> => {
      const existing = open.get(name)
      if (existing) return existing
      const slug = name.toLowerCase()
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto(`/api/auth/test-login?user=${slug}&returnTo=/trips`)
      await page.waitForURL(/\/trips$/, { timeout: 15_000 })
      const user = { context, page, name, email: `${slug}@deepspace.test`, userId: `test-${slug}` }
      open.set(name, user)
      return user
    }
    await provide(async (selector) => {
      const names = typeof selector === 'number' ? ACCOUNTS.slice(0, selector) : selector
      if (names.length > ACCOUNTS.length && typeof selector === 'number') throw new Error(`At most ${ACCOUNTS.length} test users`)
      const out: TestUser[] = []
      for (const n of names) out.push(await signIn(n))
      return out
    })
    for (const u of open.values()) await u.context.close()
  },
})

export { expect }
