/**
 * Test-only sign-in (docs/MIGRATION.md, Phase 2e). Replaces the Phase 1 stub.
 *
 * Active ONLY when ALLOW_TEST_AUTH is exactly "true". `npm run workerd` and
 * the Playwright run set it locally; it is never set on the server. When it
 * is off, every route here passes straight through, so `/api/auth/test-login`
 * ends in the app's ordinary JSON 404 (proved in src/server/test-auth.test.ts).
 *
 *   GET /api/auth/test-login?user=alice[&returnTo=/trip/x]  → signed in as "Alice"
 *   GET /api/auth/test-login                                → a page of links
 *
 * A test user is any short slug: id `test-<slug>`, name from the slug,
 * email `<slug>@deepspace.test`. That domain is what turns on the free local
 * AI stand-in (src/actions/local-test.ts), so tests never call real AI.
 * Tokens are the app's own ES256 tokens, signed with the same key as Cognito
 * sign-ins (src/server/cognito-auth.ts), so the SDK's verifyJwt checks them
 * like real ones.
 */

import type { Hono } from 'hono'
import type { AppContext, Env } from '../../worker.js'
import { appKeyPem, cookie, mintAppToken, safeReturnTo, type CognitoEnv } from './cognito-auth.js'

export const TEST_COOKIE = 'cofarer_test_user'
/** Lowercase words joined by single hyphens, e.g. "alice", "bob-2" (no empty pieces). */
const SLUG = /^(?=.{1,32}$)[a-z][a-z0-9]*(-[a-z0-9]+)*$/

export const testAuthEnabled = (env: Pick<Env, 'ALLOW_TEST_AUTH'>) => env.ALLOW_TEST_AUTH === 'true'

export interface TestUser { id: string; name: string; email: string }

/** "alice" → Alice, "bob-2" → Bob 2. */
export function testUser(slug: string): TestUser | null {
  if (!SLUG.test(slug)) return null
  const name = slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
  return { id: `test-${slug}`, name, email: `${slug}@deepspace.test` }
}

function currentTestUser(req: Request): TestUser | null {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const slug = new RegExp(`(?:^|;\\s*)${TEST_COOKIE}=([a-z0-9-]+)`).exec(cookieHeader)?.[1]
  return slug ? testUser(slug) : null
}

const asCognitoEnv = (env: Env) => env as unknown as CognitoEnv

/** Registered before the Cognito routes; with no test cookie they pass through to Cognito. */
export function registerTestAuthRoutes(app: Hono<AppContext>): void {
  app.get('/api/auth/test-login', (c, next) => {
    if (!testAuthEnabled(c.env)) return next()
    const slug = c.req.query('user')
    if (slug) {
      const user = testUser(slug)
      if (!user) return c.json({ error: 'user must be a short lowercase slug, like "alice"' }, 400)
      return new Response(null, {
        status: 302,
        headers: {
          Location: safeReturnTo(c.req.query('returnTo')),
          'Set-Cookie': cookie(asCognitoEnv(c.env), TEST_COOKIE, slug, { maxAge: 86_400 }),
          'Cache-Control': 'no-store',
        },
      })
    }
    const links = ['alice', 'bob', 'carol']
      .map((s) => `<li><a href="/api/auth/test-login?user=${s}">Sign in as ${testUser(s)!.name}</a></li>`)
      .join('')
    return c.html(`<!doctype html><meta charset="utf-8"><title>Test sign-in</title><h1>Test sign-in (local only)</h1><ul>${links}</ul>`)
  })

  app.get('/api/auth/get-session', (c, next) => {
    if (!testAuthEnabled(c.env)) return next()
    const user = currentTestUser(c.req.raw)
    if (!user) return next()
    const now = new Date().toISOString()
    return c.json({
      session: { id: `test-session-${user.id}`, userId: user.id, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), createdAt: now, updatedAt: now },
      user: { id: user.id, name: user.name, email: user.email, image: null, emailVerified: true, createdAt: now, updatedAt: now },
    })
  })

  app.post('/api/auth/token', async (c, next) => {
    if (!testAuthEnabled(c.env)) return next()
    const user = currentTestUser(c.req.raw)
    if (!user) return next()
    const pem = await appKeyPem(asCognitoEnv(c.env))
    if (!pem) return c.json({ error: 'No signing key' }, 503)
    return c.json({ token: await mintAppToken(asCognitoEnv(c.env), pem, { sub: user.id, name: user.name, email: user.email }) })
  })

  const signOut = (c: { env: Env }) => cookie(asCognitoEnv(c.env), TEST_COOKIE, '', { maxAge: 0 })

  app.post('/api/auth/sign-out', (c, next) => {
    if (!testAuthEnabled(c.env) || !currentTestUser(c.req.raw)) return next()
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': signOut(c) } })
  })

  app.get('/auth/logout', (c, next) => {
    if (!testAuthEnabled(c.env) || !currentTestUser(c.req.raw)) return next()
    return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': signOut(c) } })
  })
}
