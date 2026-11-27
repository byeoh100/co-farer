import { Hono } from 'hono'
import { exportPKCS8, generateKeyPair } from 'jose'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AppContext } from '../../worker'
import { SESSION_COOKIE, resetCognitoCache, seal } from './cognito-auth'
import { registerLandingRedirect } from './landing'
import { TEST_COOKIE } from './test-auth'

let pem = ''
beforeAll(async () => {
  pem = await exportPKCS8((await generateKeyPair('ES256', { extractable: true })).privateKey)
})
beforeEach(() => resetCognitoCache())

const env = (extra: object = {}) => ({
  COGNITO_DOMAIN: 'https://x.auth.us-east-2.amazoncognito.com', COGNITO_CLIENT_ID: 'c', COGNITO_USER_POOL_ID: 'us-east-2_X',
  APP_URL: 'https://co-farer.duckdns.org', APP_JWT_PRIVATE_KEY: pem, AUTH_JWT_ISSUER: 'i', ...extra,
})
function app() {
  const a = new Hono<AppContext>()
  registerLandingRedirect(a)
  a.get('/', (c) => c.text('landing'))
  return a
}
const get = (cookie: string | null, e: object = env()) =>
  app().request('https://co-farer.duckdns.org/', { headers: cookie ? { cookie } : {} }, e as never)
const session = (over: object = {}) => seal(pem, { sub: 'u', email: 'a@x.com', name: 'A', rt: 'r', chk: Date.now(), iat: Date.now(), ...over })

describe('landing redirect', () => {
  it('sends a signed-in visitor to /trips, uncached', async () => {
    const res = await get(`${SESSION_COOKIE}=${await session()}`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/trips')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
  it('shows the landing page to everyone else', async () => {
    for (const cookie of [null, `${SESSION_COOKIE}=garbage`, `${SESSION_COOKIE}=${await session({ iat: Date.now() - 40 * 86_400_000 })}`]) {
      expect(await (await get(cookie)).text()).toBe('landing')
    }
    // A session sealed under another key is not a session.
    const other = await exportPKCS8((await generateKeyPair('ES256', { extractable: true })).privateKey)
    expect(await (await get(`${SESSION_COOKIE}=${await seal(other, { sub: 'u', email: 'a@x.com', name: 'A', rt: 'r', chk: 1, iat: Date.now() })}`)).text()).toBe('landing')
  })
  it('counts the local test sign-in only when it is switched on', async () => {
    expect((await get(`${TEST_COOKIE}=alice`, env({ ALLOW_TEST_AUTH: 'true' }))).status).toBe(302)
    expect(await (await get(`${TEST_COOKIE}=alice`)).text()).toBe('landing')
  })
})
