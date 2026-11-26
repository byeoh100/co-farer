/**
 * Phase 1 of docs/MIGRATION.md only: a stand-in sign-in for running on plain
 * `workerd` with no DeepSpace auth server. Phase 2b replaces it with Cognito.
 *
 * Active only when LOCAL_STUB_AUTH is exactly "true" (set by
 * scripts/workerd-run.mjs; never on a server). It answers the two endpoints
 * the browser's auth client calls (`get-session`, `token`) for two fake
 * users, and mints short-lived ES256 tokens with a local key pair, so the
 * SDK's normal `verifyJwt` checks them like real ones.
 *
 * Without a stub cookie every route passes through, so the real Cognito
 * sign-in (src/server/cognito-auth.ts) works alongside it locally.
 */

import type { Hono } from 'hono'
import type { AppContext, Env } from '../../worker.js'

const COOKIE = 'cofarer_stub_user'
const TOKEN_TTL_S = 15 * 60

/** The two fake users. @deepspace.test emails turn on the free local AI stand-in. */
const STUB_USERS: Record<string, { id: string; name: string; email: string }> = {
  alice: { id: 'stub-alice', name: 'Alice Stub', email: 'alice-stub@deepspace.test' },
  bob: { id: 'stub-bob', name: 'Bob Stub', email: 'bob-stub@deepspace.test' },
}

export const stubAuthEnabled = (env: Env) => env.LOCAL_STUB_AUTH === 'true'

function currentUser(req: Request) {
  const cookie = req.headers.get('cookie') ?? ''
  const key = /(?:^|;\s*)cofarer_stub_user=([a-z]+)/.exec(cookie)?.[1]
  return key ? (STUB_USERS[key] ?? null) : null
}

const b64url = (bytes: Uint8Array | string) => {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  let s = ''
  for (const b of raw) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let signingKey: Promise<CryptoKey> | null = null
function getSigningKey(pem: string): Promise<CryptoKey> {
  signingKey ??= (async () => {
    const body = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
    const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
    return crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  })()
  return signingKey
}

async function mintToken(env: Env, user: { id: string; name: string; email: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({ sub: user.id, name: user.name, email: user.email, iss: env.AUTH_JWT_ISSUER, iat: now, exp: now + TOKEN_TTL_S }),
  )
  const key = await getSigningKey(env.STUB_AUTH_PRIVATE_KEY ?? '')
  // WebCrypto ECDSA returns the raw r||s signature JWS expects.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${payload}`))
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`
}

/**
 * Registered before the DeepSpace auth routes. When the stub is off, every
 * handler passes through (next) so the real routes answer unchanged.
 */
export function registerStubAuthRoutes(app: Hono<AppContext>): void {
  app.get('/api/auth/stub-login', (c, next) => {
    if (!stubAuthEnabled(c.env)) return next()
    const key = c.req.query('user')
    if (key && STUB_USERS[key]) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/trips', 'Set-Cookie': `${COOKIE}=${key}; Path=/; HttpOnly; SameSite=Lax` },
      })
    }
    const links = Object.entries(STUB_USERS)
      .map(([k, u]) => `<li><a href="/api/auth/stub-login?user=${k}">Sign in as ${u.name}</a></li>`)
      .join('')
    return c.html(`<!doctype html><meta charset="utf-8"><title>Local sign-in</title><h1>Local sign-in (Phase 1 stub)</h1><ul>${links}</ul>`)
  })

  // With no stub cookie these pass through, so Cognito sign-in (2b) works side by side locally.
  app.get('/api/auth/get-session', (c, next) => {
    if (!stubAuthEnabled(c.env)) return next()
    const user = currentUser(c.req.raw)
    if (!user) return c.env.COGNITO_CLIENT_ID ? next() : c.json(null)
    const now = new Date().toISOString()
    return c.json({
      session: { id: `stub-session-${user.id}`, userId: user.id, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), createdAt: now, updatedAt: now },
      user: { id: user.id, name: user.name, email: user.email, image: null, emailVerified: true, createdAt: now, updatedAt: now },
    })
  })

  app.post('/api/auth/token', async (c, next) => {
    if (!stubAuthEnabled(c.env)) return next()
    const user = currentUser(c.req.raw)
    if (!user) return c.env.COGNITO_CLIENT_ID ? next() : c.json({ error: 'Not signed in' }, 401)
    return c.json({ token: await mintToken(c.env, user) })
  })

  app.all('/api/auth/sign-out', (c, next) => {
    if (!stubAuthEnabled(c.env) || !currentUser(c.req.raw)) return next()
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` },
    })
  })
}
