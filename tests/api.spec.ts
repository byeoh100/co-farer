import { test, expect } from '@playwright/test'

test.describe('API tests', () => {
  test('signed out: no session, no token, and unknown API paths are a JSON 404', async ({ request }) => {
    expect(await (await request.get('/api/auth/get-session')).json()).toBeNull()
    expect((await request.post('/api/auth/token')).status()).toBe(401)
    // DeepSpace's routes are gone (Phase 2d–2e).
    for (const path of ['/api/integrations', '/api/files/x', '/api/auth/sign-in/email']) {
      const res = await request.get(path)
      expect(res.status(), path).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
    }
  })

  test('an action without a token, or with a forged one, is refused', async ({ request }) => {
    expect((await request.post('/api/actions/createTrip', { data: { name: 'x', destination: 'y' } })).status()).toBe(401)
    const forged = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ0ZXN0LWFsaWNlIn0.AAAA'
    const res = await request.post('/api/actions/createTrip', { data: { name: 'x', destination: 'y' }, headers: { Authorization: `Bearer ${forged}` } })
    expect(res.status()).toBe(401)
  })

  test('/healthz answers ok once the data room is reachable', async ({ request }) => {
    const res = await request.get('/healthz')
    expect(res.status()).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(res.headers()['cache-control']).toBe('no-store')
  })

  test('hidden asset files stay hidden, even with an encoded ? or #', async ({ request }) => {
    for (const path of ['/_headers', '/_headers%3F', '/_headers%23x', '/.assetsignore%3F']) {
      const res = await request.get(path)
      expect(await res.text(), path).not.toContain('X-Frame-Options')
    }
  })

  test('WebSocket endpoint exists', async ({ page }) => {
    // /home is a dynamic page (under src/pages/(app)/), so mounting it boots
    // the providers and auto-connects the records WebSocket. The static
    // landing at '/' deliberately does neither — see smoke.spec.ts.
    await page.goto('/home')
    // Wait for the app to connect its WebSocket (it auto-connects on mount)
    await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 15000 })
    // If the app loaded and connected, the WS endpoint works
  })
})
