import { Hono } from 'hono'
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { verifyJwt } from 'deepspace/worker'
import type { AppContext } from '../../worker'
import { registerTestAuthRoutes, TEST_COOKIE, testUser } from './test-auth'
import { resetCognitoCache } from './cognito-auth'
import { registerStaticRoutes } from './http-routes'

let pem = ''
let publicPem = ''
beforeAll(async () => {
  const k = await generateKeyPair('ES256', { extractable: true })
  pem = await exportPKCS8(k.privateKey)
  publicPem = await exportSPKI(k.publicKey)
})
beforeEach(() => resetCognitoCache())

/** The real route order's tail: test routes, then the app's API 404 guard. */
function app() {
  const a = new Hono<AppContext>()
  registerTestAuthRoutes(a)
  registerStaticRoutes(a)
  return a
}
const env = (allow?: string) => ({ ALLOW_TEST_AUTH: allow, APP_JWT_PRIVATE_KEY: pem, AUTH_JWT_ISSUER: 'iss', APP_URL: 'http://localhost:8080' })
const get = (a: Hono<AppContext>, path: string, e: object, init: RequestInit = {}) => a.request(`http://localhost:8080${path}`, init, e as never)

describe('test-only sign-in', () => {
  it('is refused unless ALLOW_TEST_AUTH is exactly "true"', async () => {
    for (const allow of [undefined, '', 'false', 'TRUE', '1', 'yes']) {
      const a = app()
      const login = await get(a, '/api/auth/test-login?user=alice', env(allow))
      expect(login.status, `ALLOW_TEST_AUTH=${allow}`).toBe(404)
      expect(login.headers.get('set-cookie')).toBeNull()
      expect((await get(a, '/api/auth/test-login', env(allow))).status).toBe(404)
      // A test cookie alone gets nothing either.
      const token = await get(a, '/api/auth/token', env(allow), { method: 'POST', headers: { cookie: `${TEST_COOKIE}=alice` } })
      expect(token.status).toBe(404)
      const session = await get(a, '/api/auth/get-session', env(allow), { headers: { cookie: `${TEST_COOKIE}=alice` } })
      expect(session.status).toBe(404)
    }
  })

  it('when on, signs in a test user whose token passes verifyJwt', async () => {
    const a = app()
    const login = await get(a, '/api/auth/test-login?user=bob&returnTo=%2Ftrip%2Fx', env('true'))
    expect(login.status).toBe(302)
    expect(login.headers.get('location')).toBe('/trip/x')
    expect(login.headers.get('set-cookie')).toMatch(/^cofarer_test_user=bob; Path=\/; HttpOnly; SameSite=Lax/)

    const headers = { cookie: `${TEST_COOKIE}=bob` }
    const s = (await (await get(a, '/api/auth/get-session', env('true'), { headers })).json()) as { user: unknown }
    expect(s.user).toMatchObject({ id: 'test-bob', name: 'Bob', email: 'bob@deepspace.test' })
    const { token } = (await (await get(a, '/api/auth/token', env('true'), { method: 'POST', headers })).json()) as { token: string }
    expect((await verifyJwt({ publicKey: publicPem, issuer: 'iss' }, token)).result?.userId).toBe('test-bob')
  })

  it('accepts only short slugs and safe return paths', async () => {
    expect(testUser('carol-2')).toEqual({ id: 'test-carol-2', name: 'Carol 2', email: 'carol-2@deepspace.test' })
    for (const bad of ['Alice', 'a b', 'x'.repeat(40), '../admin', '', 'bob-', 'a--b', '-a']) expect(testUser(bad)).toBeNull()
    const a = app()
    expect((await get(a, '/api/auth/test-login?user=Evil%20One', env('true'))).status).toBe(400)
    expect((await get(a, '/api/auth/test-login?user=bob-', env('true'))).status).toBe(400)
    // A malformed test cookie is ignored, not a crash.
    expect((await get(a, '/api/auth/token', env('true'), { method: 'POST', headers: { cookie: `${TEST_COOKIE}=bob-` } })).status).toBe(404)
    expect((await get(a, '/api/auth/test-login?user=bob&returnTo=https%3A%2F%2Fevil.example', env('true'))).headers.get('location')).toBe('/trips')
  })
})
