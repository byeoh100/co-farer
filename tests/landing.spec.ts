/**
 * The landing page and its redirects (co-farer-landing/LANDING-SPEC.md, §1 and §4).
 */
import { test, expect } from './helpers/fixtures'

test('signed in: / goes straight to /trips, and Back doesn’t bounce to /', async ({ users }) => {
  const [a] = await users(1)
  await a.page.goto('/settings')
  await a.page.goto('/')
  await expect(a.page).toHaveURL(/\/trips$/)
  await expect(a.page.getByRole('heading', { name: 'Where to next?' })).toBeVisible({ timeout: 15_000 })
  await a.page.goBack()
  await expect(a.page).toHaveURL(/\/settings$/)
})

test('signed out: the landing page, and every way in goes through sign-in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Plan the trip,\s*not the group\s*chat\./i)

  // Plan a trip → sign-in, coming back to /trips with "Plan a trip" open.
  await page.getByRole('link', { name: 'Plan a trip, it’s free' }).click()
  await expect(page.getByTestId('sign-in-screen')).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/trips\?new=1$/)

  // I have an invite → the sign-in page, back to /trips with "Join with a code" open.
  await page.goto('/')
  await page.getByRole('link', { name: 'I have an invite' }).click()
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Ftrips%3Fjoin%3D1$/)
  await expect(page.getByTestId('sign-in-google')).toHaveAttribute('href', /returnTo=%2Ftrips%3Fjoin%3D1/)

  // Sign in → the sign-in page, back to /trips.
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Ftrips$/)
})

test('after signing in from the landing page, Plan a trip and I have an invite open', async ({ users }) => {
  const [a] = await users(1)
  await a.page.goto('/trips?new=1')
  await expect(a.page.getByRole('heading', { name: 'Plan a trip' })).toBeVisible({ timeout: 15_000 })
  await expect(a.page).toHaveURL(/\/trips$/)
  await a.page.goto('/trips?join=1')
  await expect(a.page.getByRole('heading', { name: 'Join with a code' })).toBeVisible({ timeout: 15_000 })
})

test('invite links still work signed out (sign-in first) and signed in', async ({ page, users }) => {
  const [a, b] = await users(2)
  const trip = await a.page.evaluate(async () => {
    const t = await (await fetch('/api/auth/token', { method: 'POST' })).json()
    const r = await fetch('/api/actions/createTrip', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.token}` }, body: JSON.stringify({ name: 'Invite check', destination: 'Cachuma Lake' }) })
    return (await r.json()).data.tripId as string
  })
  await a.page.goto(`/trip/${trip}`)
  await a.page.getByTestId('members-stack').click({ timeout: 15_000 })
  const link = new URL(await a.page.getByTestId('invite-link').inputValue())
  // Signed out: the invite page asks you to sign in first, and keeps the link to come back to.
  await page.goto(link.pathname)
  await expect(page.getByTestId('sign-in-screen')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('sign-in-google')).toHaveAttribute('href', new RegExp(encodeURIComponent(link.pathname)))
  // Signed in: it joins as before.
  await b.page.goto(link.pathname)
  await b.page.getByTestId('join-button').click({ timeout: 15_000 })
  await b.page.waitForURL(/settings\?welcome=1/, { timeout: 20_000 })
})

test('signing out lands on the landing page', async ({ users }) => {
  const [a] = await users(1)
  await a.page.goto('/trips')
  await a.page.getByRole('button', { name: 'Account menu' }).click({ timeout: 15_000 })
  await a.page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(a.page).toHaveURL(/\/$/)
  await expect(a.page.getByTestId('static-landing')).toBeVisible()
})
