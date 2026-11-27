/**
 * Sign-in with Amazon Cognito (docs/MIGRATION.md, Phase 2b).
 *
 * The browser keeps the SDK's own auth client (`useAuthStatus`, `useUser`,
 * `getAuthToken`, `RecordProvider`), which only talks to same-origin
 * `/api/auth/*` routes. This file answers those routes from a Cognito
 * session instead of DeepSpace's auth server:
 *
 *   GET  /auth/login?provider=google|email   → Cognito managed login (code + PKCE)
 *   GET  /auth/callback                      ← code exchanged here, on the server
 *   GET  /api/auth/get-session               → { session, user } or null
 *   POST /api/auth/token                     → { token }: the app's own ES256 JWT, 15 minutes
 *   POST /api/auth/sign-out, GET /auth/logout
 *
 * Security:
 *  - The Cognito ID token is verified with jose against the pool's JWKS
 *    (RS256, issuer, audience = the app client, token_use = id).
 *  - The session is an AES-GCM-encrypted HttpOnly cookie. It holds the
 *    Cognito refresh token, which never reaches JavaScript.
 *  - App tokens last 15 minutes. At most every 15 minutes, minting one
 *    re-checks the account with Cognito (refresh grant), so a disabled or
 *    signed-out account stops working within that window.
 *  - The app's signing key comes from Parameter Store
 *    (/cofarer/app-jwt-private-key), or APP_JWT_PRIVATE_KEY locally.
 *    AUTH_JWT_PUBLIC_KEY must be its public half; the SDK's verifyJwt
 *    checks every request against it.
 *
 * Inert unless COGNITO_CLIENT_ID is set, so the DeepSpace build is unchanged.
 */

import type { Hono } from 'hono'
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { AppContext, Env } from '../../worker.js'
import { getParameter, type AwsEnv } from '../lib/aws'

export interface CognitoEnv extends AwsEnv {
  /** e.g. https://co-farer.auth.us-east-2.amazoncognito.com */
  COGNITO_DOMAIN?: string
  COGNITO_CLIENT_ID?: string
  COGNITO_USER_POOL_ID?: string
  /** The app's own origin, e.g. https://co-farer.duckdns.org or http://localhost:8080. */
  APP_URL?: string
  /** Local development only; the server reads /cofarer/app-jwt-private-key. */
  APP_JWT_PRIVATE_KEY?: string
  AUTH_JWT_ISSUER: string
}

export const SESSION_COOKIE = 'cofarer_session'
const OAUTH_COOKIE = 'cofarer_oauth'
export const APP_TOKEN_TTL_S = 15 * 60
/** How often minting a token re-checks the account with Cognito. */
export const RECHECK_MS = 15 * 60_000
const SESSION_TTL_S = 30 * 24 * 3600
const OAUTH_TTL_MS = 10 * 60_000
export const APP_KEY_PARAMETER = '/cofarer/app-jwt-private-key'

export const cognitoEnabled = (env: Partial<CognitoEnv>) => !!(env.COGNITO_CLIENT_ID && env.COGNITO_DOMAIN && env.COGNITO_USER_POOL_ID && env.APP_URL)

/** What the session cookie holds (encrypted). */
export interface Session {
  sub: string
  email: string
  name: string
  /** Cognito refresh token. */
  rt: string
  /** When the account was last checked with Cognito (epoch ms). */
  chk: number
  /** Session start (epoch ms). */
  iat: number
}

// ── Small helpers (pure, unit-tested) ────────────────────────────────────

export function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

/** Only same-site paths survive the round trip through Cognito ("/trip/x?y"), never "//evil" or a URL. */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || raw.length > 500) return '/trips'
  if (raw.startsWith('/auth/') || raw.startsWith('/api/')) return '/trips'
  return raw
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? ''
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1)
  }
  return null
}

export function cookie(env: Pick<CognitoEnv, 'APP_URL'>, name: string, value: string, opts: { maxAge: number; path?: string }): string {
  // Secure only over https: Safari drops Secure cookies on http://localhost.
  const secure = env.APP_URL?.startsWith('https://') ? '; Secure' : ''
  return `${name}=${value}; Path=${opts.path ?? '/'}; HttpOnly; SameSite=Lax; Max-Age=${opts.maxAge}${secure}`
}

export function authorizeUrl(env: CognitoEnv, p: { state: string; challenge: string; provider: 'google' | 'email' }): string {
  const u = new URL('/oauth2/authorize', env.COGNITO_DOMAIN)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', env.COGNITO_CLIENT_ID!)
  u.searchParams.set('redirect_uri', callbackUrl(env))
  u.searchParams.set('scope', 'openid email profile')
  u.searchParams.set('state', p.state)
  u.searchParams.set('code_challenge', p.challenge)
  u.searchParams.set('code_challenge_method', 'S256')
  // Google goes straight to Google; email shows Cognito's own page (email code).
  if (p.provider === 'google') u.searchParams.set('identity_provider', 'Google')
  return u.toString()
}

const callbackUrl = (env: CognitoEnv) => `${env.APP_URL!.replace(/\/$/, '')}/auth/callback`

/** A display name: the name claim, else the part of the email before "@". */
export function displayName(name: unknown, email: string): string {
  const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : ''
  return (n || email.split('@')[0] || 'Traveler').slice(0, 80)
}

// ── Session cookie encryption (AES-GCM, key derived from the app key) ───

const sealKeys = new Map<string, Promise<CryptoKey>>()

/** An AES-256-GCM key derived (HKDF) from the app's signing key, so there's no second secret to manage. */
function sealKey(secret: string): Promise<CryptoKey> {
  let k = sealKeys.get(secret)
  if (!k) {
    k = (async () => {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey'])
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('cofarer-session'), info: new TextEncoder().encode('v1') },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      )
    })()
    sealKeys.set(secret, k)
  }
  return k
}

export async function seal(secret: string, data: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(secret), new TextEncoder().encode(JSON.stringify(data)))
  return `${b64url(iv)}.${b64url(new Uint8Array(ct))}`
}

/** Null for anything missing, tampered with, or sealed under another key. */
export async function unseal<T>(secret: string, value: string | null): Promise<T | null> {
  if (!value) return null
  const [iv, ct] = value.split('.')
  if (!iv || !ct) return null
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await sealKey(secret), fromB64url(ct))
    return JSON.parse(new TextDecoder().decode(pt)) as T
  } catch {
    return null
  }
}

export function isSession(v: unknown): v is Session {
  const s = v as Partial<Session> | null
  return !!s && typeof s.sub === 'string' && !!s.sub && typeof s.email === 'string' && typeof s.name === 'string'
    && typeof s.rt === 'string' && typeof s.chk === 'number' && typeof s.iat === 'number'
    && Date.now() - s.iat < SESSION_TTL_S * 1000
}

// ── Cognito ID token and the app's own token ─────────────────────────────

export interface IdClaims { sub: string; email: string; name: string }

let remoteJwks: { url: string; get: JWTVerifyGetKey } | null = null
function poolJwks(env: CognitoEnv): JWTVerifyGetKey {
  const url = `${issuerOf(env)}/.well-known/jwks.json`
  if (remoteJwks?.url !== url) remoteJwks = { url, get: createRemoteJWKSet(new URL(url)) }
  return remoteJwks.get
}

const issuerOf = (env: CognitoEnv) => {
  const region = env.COGNITO_USER_POOL_ID!.split('_')[0]
  return `https://cognito-idp.${region}.amazonaws.com/${env.COGNITO_USER_POOL_ID}`
}

/** Checks a Cognito ID token: signature (RS256, pool JWKS), issuer, audience, expiry, token_use, email. */
export async function verifyIdToken(env: CognitoEnv, token: string, keys: JWTVerifyGetKey = poolJwks(env)): Promise<IdClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: issuerOf(env),
      audience: env.COGNITO_CLIENT_ID,
      algorithms: ['RS256'],
    })
    if (payload.token_use !== 'id' || typeof payload.sub !== 'string' || typeof payload.email !== 'string' || !payload.email) return null
    const email = payload.email.toLowerCase()
    return { sub: payload.sub, email, name: displayName(payload.name, email) }
  } catch {
    return null
  }
}

let cachedAppKey: { pem: string; key: CryptoKey } | null = null
let cachedPem: string | null = null

/** The app's signing key (PKCS#8 PEM): APP_JWT_PRIVATE_KEY locally, else Parameter Store (read once). */
export async function appKeyPem(env: CognitoEnv): Promise<string | null> {
  if (env.APP_JWT_PRIVATE_KEY) return env.APP_JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
  cachedPem ??= await getParameter(env, APP_KEY_PARAMETER)
  return cachedPem
}

/** The app's own ES256 token, with the claims the SDK's verifyJwt and the data rooms read. */
export async function mintAppToken(env: CognitoEnv, pem: string, user: { sub: string; email: string; name: string }): Promise<string> {
  if (cachedAppKey?.pem !== pem) cachedAppKey = { pem, key: await importPKCS8(pem, 'ES256') }
  return new SignJWT({ name: user.name, email: user.email })
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
    .setSubject(user.sub)
    .setIssuer(env.AUTH_JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${APP_TOKEN_TTL_S}s`)
    .sign(cachedAppKey.key)
}

/** Test hook. */
export function resetCognitoCache(): void {
  cachedAppKey = null
  cachedPem = null
  remoteJwks = null
  sealKeys.clear()
}

// ── Talking to Cognito ───────────────────────────────────────────────────

type TokenReply = { id_token?: string; refresh_token?: string; error?: string }
type TokenResult = { ok: true; reply: TokenReply } | { ok: false; rejected: boolean }

async function tokenEndpoint(env: CognitoEnv, form: Record<string, string>): Promise<TokenResult> {
  try {
    const res = await fetch(new URL('/oauth2/token', env.COGNITO_DOMAIN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: env.COGNITO_CLIENT_ID!, ...form }),
      signal: AbortSignal.timeout(10_000),
    })
    const reply = (await res.json().catch(() => ({}))) as TokenReply
    if (res.ok) return { ok: true, reply }
    // 400 invalid_grant: the code or refresh token is no good (expired, revoked, account disabled).
    console.error(`[auth] Cognito token endpoint answered HTTP ${res.status} (${reply.error ?? 'no error code'})`)
    return { ok: false, rejected: res.status === 400 || res.status === 401 }
  } catch (err) {
    console.error(`[auth] Cognito token endpoint unreachable: ${err instanceof Error ? err.name : typeof err}`)
    return { ok: false, rejected: false }
  }
}

async function revoke(env: CognitoEnv, refreshToken: string): Promise<void> {
  try {
    await fetch(new URL('/oauth2/revoke', env.COGNITO_DOMAIN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken, client_id: env.COGNITO_CLIENT_ID! }),
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    // Best effort: the cookie is cleared either way.
  }
}

// ── Routes ───────────────────────────────────────────────────────────────

interface OAuthState { state: string; verifier: string; returnTo: string; exp: number }

const clearCookie = (env: CognitoEnv, name: string, path = '/') => cookie(env, name, '', { maxAge: 0, path })

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' })
  for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(null, { status: 302, headers })
}

function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(JSON.stringify(body), { status, headers })
}

/** Registered before the DeepSpace auth routes; every handler passes through when Cognito isn't configured. */
export function registerCognitoAuthRoutes(app: Hono<AppContext>): void {
  const env = (c: { env: Env }) => c.env as unknown as CognitoEnv

  app.get('/auth/login', async (c, next) => {
    const e = env(c)
    if (!cognitoEnabled(e)) return next()
    const pem = await appKeyPem(e)
    if (!pem) return c.text('Sign-in is not available right now.', 503)
    const provider = c.req.query('provider') === 'google' ? 'google' : 'email'
    const st: OAuthState = { state: randomToken(), verifier: randomToken(48), returnTo: safeReturnTo(c.req.query('returnTo')), exp: Date.now() + OAUTH_TTL_MS }
    return redirect(authorizeUrl(e, { state: st.state, challenge: await pkceChallenge(st.verifier), provider }), [
      cookie(e, OAUTH_COOKIE, await seal(pem, st), { maxAge: OAUTH_TTL_MS / 1000, path: '/auth' }),
    ])
  })

  // The SDK's AuthOverlay sends social sign-in here.
  app.get('/api/auth/social-redirect', (c, next) => {
    if (!cognitoEnabled(env(c))) return next()
    const provider = c.req.query('provider') === 'google' ? 'google' : 'email'
    return redirect(`/auth/login?provider=${provider}`)
  })

  app.get('/auth/callback', async (c, next) => {
    const e = env(c)
    if (!cognitoEnabled(e)) return next()
    const failed = (why: string) => {
      console.error(`[auth] sign-in callback failed: ${why}`)
      return redirect('/trips?signin=failed', [clearCookie(e, OAUTH_COOKIE, '/auth')])
    }
    const pem = await appKeyPem(e)
    if (!pem) return failed('no app signing key')
    const st = await unseal<OAuthState>(pem, readCookie(c.req.raw, OAUTH_COOKIE))
    const code = c.req.query('code')
    if (c.req.query('error')) return failed(`Cognito error ${c.req.query('error')}`)
    if (!st || st.exp < Date.now()) return failed('missing or expired state cookie')
    if (!code || c.req.query('state') !== st.state) return failed('state mismatch')

    const t = await tokenEndpoint(e, { grant_type: 'authorization_code', code, redirect_uri: callbackUrl(e), code_verifier: st.verifier })
    if (!t.ok || !t.reply.id_token || !t.reply.refresh_token) return failed('code exchange')
    const claims = await verifyIdToken(e, t.reply.id_token)
    if (!claims) return failed('ID token did not verify')

    const now = Date.now()
    const session: Session = { ...claims, rt: t.reply.refresh_token, chk: now, iat: now }
    return redirect(st.returnTo, [
      clearCookie(e, OAUTH_COOKIE, '/auth'),
      cookie(e, SESSION_COOKIE, await seal(pem, session), { maxAge: SESSION_TTL_S }),
    ])
  })

  app.get('/api/auth/get-session', async (c, next) => {
    const e = env(c)
    if (!cognitoEnabled(e)) return next()
    const pem = await appKeyPem(e)
    const s = pem ? await unseal<Session>(pem, readCookie(c.req.raw, SESSION_COOKIE)) : null
    if (!isSession(s)) return json(null)
    const at = new Date(s.iat).toISOString()
    // Initials only for now (no profile pictures): image stays null.
    return json({
      session: { id: `cognito-${s.sub}-${s.iat}`, userId: s.sub, expiresAt: new Date(s.iat + SESSION_TTL_S * 1000).toISOString(), createdAt: at, updatedAt: at },
      user: { id: s.sub, name: s.name, email: s.email, image: null, emailVerified: true, createdAt: at, updatedAt: at },
    })
  })

  app.post('/api/auth/token', async (c, next) => {
    const e = env(c)
    if (!cognitoEnabled(e)) return next()
    const pem = await appKeyPem(e)
    if (!pem) return json({ error: 'Sign-in is not available right now.' }, 503)
    let s = await unseal<Session>(pem, readCookie(c.req.raw, SESSION_COOKIE))
    if (!isSession(s)) return json({ error: 'Not signed in' }, 401, s ? [clearCookie(e, SESSION_COOKIE)] : [])

    const cookies: string[] = []
    if (Date.now() - s.chk > RECHECK_MS) {
      const t = await tokenEndpoint(e, { grant_type: 'refresh_token', refresh_token: s.rt })
      if (!t.ok) {
        // Refused: the account was disabled or signed out elsewhere. Unreachable: try again later, keep the session.
        return t.rejected ? json({ error: 'Not signed in' }, 401, [clearCookie(e, SESSION_COOKIE)]) : json({ error: 'Sign-in check failed, try again.' }, 503)
      }
      const claims = t.reply.id_token ? await verifyIdToken(e, t.reply.id_token) : null
      if (!claims || claims.sub !== s.sub) return json({ error: 'Not signed in' }, 401, [clearCookie(e, SESSION_COOKIE)])
      s = { ...s, ...claims, rt: t.reply.refresh_token ?? s.rt, chk: Date.now() }
      cookies.push(cookie(e, SESSION_COOKIE, await seal(pem, s), { maxAge: Math.max(60, Math.floor((s.iat + SESSION_TTL_S * 1000 - Date.now()) / 1000)) }))
    }
    return json({ token: await mintAppToken(e, pem, s) }, 200, cookies)
  })

  const endSession = async (c: { env: Env; req: { raw: Request } }) => {
    const e = env(c)
    const pem = await appKeyPem(e)
    const s = pem ? await unseal<Session>(pem, readCookie(c.req.raw, SESSION_COOKIE)) : null
    if (s && typeof s.rt === 'string') await revoke(e, s.rt)
    return [clearCookie(e, SESSION_COOKIE)]
  }

  app.post('/api/auth/sign-out', async (c, next) => {
    if (!cognitoEnabled(env(c))) return next()
    return json({ success: true }, 200, await endSession(c))
  })

  // Full sign-out: clears the app session, then Cognito's own, so the next sign-in can pick another account.
  app.get('/auth/logout', async (c, next) => {
    const e = env(c)
    if (!cognitoEnabled(e)) return next()
    const cookies = await endSession(c)
    const u = new URL('/logout', e.COGNITO_DOMAIN)
    u.searchParams.set('client_id', e.COGNITO_CLIENT_ID!)
    u.searchParams.set('logout_uri', `${e.APP_URL!.replace(/\/$/, '')}/`)
    return redirect(u.toString(), cookies)
  })
}
