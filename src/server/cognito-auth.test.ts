import { Hono } from 'hono'
import { SignJWT, exportJWK, exportPKCS8, exportSPKI, generateKeyPair, createLocalJWKSet, type JWK } from 'jose'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyJwt } from 'deepspace/worker'
import type { AppContext } from '../../worker'
import {
  loginHint, RECHECK_MS, SESSION_COOKIE, authorizeUrl, cookie, displayName, mintAppToken, pkceChallenge, readCookie,
  registerCognitoAuthRoutes, resetCognitoCache, safeReturnTo, seal, unseal, verifyIdToken, type CognitoEnv,
} from './cognito-auth'

const POOL = 'us-east-2_TESTPOOL'
const ISS = `https://cognito-idp.us-east-2.amazonaws.com/${POOL}`
const CLIENT = 'test-client-id'

let appPem = ''
let appPublicPem = ''
let otherPem = ''
let rsaPrivate: CryptoKey
let jwks: { keys: JWK[] }
let ENV: CognitoEnv

beforeAll(async () => {
  const app = await generateKeyPair('ES256', { extractable: true })
  appPem = await exportPKCS8(app.privateKey)
  appPublicPem = await exportSPKI(app.publicKey)
  otherPem = await exportPKCS8((await generateKeyPair('ES256', { extractable: true })).privateKey)
  const rsa = await generateKeyPair('RS256', { extractable: true })
  rsaPrivate = rsa.privateKey
  jwks = { keys: [{ ...(await exportJWK(rsa.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] }
  ENV = {
    COGNITO_DOMAIN: 'https://co-farer.auth.us-east-2.amazoncognito.com',
    COGNITO_CLIENT_ID: CLIENT,
    COGNITO_USER_POOL_ID: POOL,
    APP_URL: 'https://co-farer.duckdns.org',
    APP_JWT_PRIVATE_KEY: appPem,
    AUTH_JWT_ISSUER: 'https://co-farer.duckdns.org',
  }
})

beforeEach(() => resetCognitoCache())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A Cognito-style ID token signed with the test pool key. */
function idToken(claims: Record<string, unknown> = {}, opts: { aud?: string; iss?: string; exp?: string; key?: CryptoKey } = {}) {
  return new SignJWT({ token_use: 'id', email: 'Ana@Example.com', name: 'Ana Lima', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject((claims.sub as string) ?? 'cognito-sub-1')
    .setIssuer(opts.iss ?? ISS)
    .setAudience(opts.aud ?? CLIENT)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '15m')
    .sign(opts.key ?? rsaPrivate)
}

const verifyCfg = () => ({ publicKey: appPublicPem, issuer: ENV.AUTH_JWT_ISSUER })

describe('small helpers', () => {
  it('keeps only same-site return paths', () => {
    expect(safeReturnTo('/trip/abc?section=housing')).toBe('/trip/abc?section=housing')
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '', null, '/auth/callback', '/api/auth/token']) {
      expect(safeReturnTo(bad)).toBe('/trips')
    }
  })
  it('builds the Cognito authorize URL with PKCE, and sends Google straight to Google', async () => {
    const challenge = await pkceChallenge('verifier')
    const g = new URL(authorizeUrl(ENV, { state: 's1', challenge, provider: 'google' }))
    expect(g.origin + g.pathname).toBe('https://co-farer.auth.us-east-2.amazoncognito.com/oauth2/authorize')
    expect(Object.fromEntries(g.searchParams)).toEqual({
      response_type: 'code', client_id: CLIENT, redirect_uri: 'https://co-farer.duckdns.org/auth/callback', scope: 'openid email profile',
      state: 's1', code_challenge: challenge, code_challenge_method: 'S256', identity_provider: 'Google',
    })
    expect(new URL(authorizeUrl(ENV, { state: 's1', challenge, provider: 'email' })).searchParams.has('identity_provider')).toBe(false)
    // S256 = base64url(SHA-256(verifier)); this pair was checked against Node's own SHA-256.
    expect(await pkceChallenge('dBjftJeZ4CVP-mJ92K9qlnPWs6kE3UE2mxXkAgO1m0o')).toBe('alAp4mAlZ-ggWqEiAiiMS7ezDB_p2hKUUprG_u5zHe0')
  })
  it('passes a typed email on to Cognito as login_hint, and nothing else', async () => {
    const challenge = await pkceChallenge('v')
    expect(new URL(authorizeUrl(ENV, { state: 's', challenge, provider: 'email', email: 'ana@x.com' })).searchParams.get('login_hint')).toBe('ana@x.com')
    expect(new URL(authorizeUrl(ENV, { state: 's', challenge, provider: 'google', email: 'ana@x.com' })).searchParams.has('login_hint')).toBe(false)
    const up = new URL(authorizeUrl(ENV, { state: 's', challenge, provider: 'signup', email: 'ana@x.com' }))
    expect(up.pathname).toBe('/signup')
    expect(up.searchParams.get('code_challenge')).toBe(challenge)
    expect(loginHint(' ana@x.com ')).toBe('ana@x.com')
    for (const bad of ['', 'not-an-email', 'a@b', '"><script>@x.com', 'a b@x.com', `${'a'.repeat(250)}@x.com`, null]) expect(loginHint(bad)).toBeNull()
  })
  it('sets HttpOnly SameSite cookies, Secure only over https', () => {
    expect(cookie(ENV, 'a', 'b', { maxAge: 60 })).toBe('a=b; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; Secure')
    expect(cookie({ APP_URL: 'http://localhost:8080' }, 'a', 'b', { maxAge: 60 })).not.toContain('Secure')
    expect(readCookie(new Request('https://x', { headers: { cookie: 'x=1; cofarer_session=abc.def' } }), SESSION_COOKIE)).toBe('abc.def')
  })
  it('names people without a name claim after their email', () => {
    expect(displayName('  Ana   Lima ', 'a@x.com')).toBe('Ana Lima')
    expect(displayName(undefined, 'sam@x.com')).toBe('sam')
  })
})

describe('session cookie encryption', () => {
  it('round-trips, and refuses tampering or another key', async () => {
    const sealed = await seal(appPem, { sub: 'u1', rt: 'secret-refresh' })
    expect(sealed).not.toContain('secret-refresh')
    expect(await unseal(appPem, sealed)).toEqual({ sub: 'u1', rt: 'secret-refresh' })
    const [iv, ct] = sealed.split('.')
    // Change one character of the ciphertext for a different one (never the same letter).
    const at = ct.length - 2
    const flipped = `${iv}.${ct.slice(0, at)}${ct[at] === 'A' ? 'B' : 'A'}${ct.slice(at + 1)}`
    expect(flipped).not.toBe(sealed)
    expect(await unseal(appPem, flipped)).toBeNull()
    expect(await unseal(otherPem, sealed)).toBeNull()
    expect(await unseal(appPem, 'garbage')).toBeNull()
    expect(await unseal(appPem, null)).toBeNull()
  })
})

describe('verifyIdToken (Cognito ID token)', () => {
  const keys = () => createLocalJWKSet(jwks)
  it('accepts a valid ID token and lowercases the email', async () => {
    expect(await verifyIdToken(ENV, await idToken(), keys())).toEqual({ sub: 'cognito-sub-1', email: 'ana@example.com', name: 'Ana Lima' })
  })
  it('refuses the wrong audience, issuer, token type, an expired token, or a forged signature', async () => {
    const forger = (await generateKeyPair('RS256')).privateKey
    const bad = [
      await idToken({}, { aud: 'some-other-client' }),
      await idToken({}, { iss: 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_OTHER' }),
      await idToken({ token_use: 'access' }),
      await idToken({}, { exp: '-1m' }),
      await idToken({}, { key: forger }),
      await idToken({ email: '' }),
    ]
    for (const t of bad) expect(await verifyIdToken(ENV, t, keys())).toBeNull()
    // alg "none"
    const none = `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(JSON.stringify({ sub: 'x', token_use: 'id', email: 'a@b.c', iss: ISS, aud: CLIENT }))}.`
    expect(await verifyIdToken(ENV, none, keys())).toBeNull()
  })
})

describe('the app token, checked by the SDK’s verifyJwt', () => {
  it('passes with the matching public key and carries sub, name and email', async () => {
    const t = await mintAppToken(ENV, appPem, { sub: 'u1', email: 'a@x.com', name: 'Ana' })
    const { result } = await verifyJwt(verifyCfg(), t)
    expect(result?.userId).toBe('u1')
    expect(result?.claims).toMatchObject({ name: 'Ana', email: 'a@x.com', iss: 'https://co-farer.duckdns.org' })
    expect((result!.claims.exp as number) - (result!.claims.iat as number)).toBe(15 * 60)
  })
  it('refuses no token, a forged token, a wrong issuer and an expired token', async () => {
    expect((await verifyJwt(verifyCfg(), '')).result).toBeNull()
    const forged = await mintAppToken(ENV, otherPem, { sub: 'u1', email: 'a@x.com', name: 'Ana' })
    expect((await verifyJwt(verifyCfg(), forged)).result).toBeNull()
    resetCognitoCache()
    const otherIss = await mintAppToken({ ...ENV, AUTH_JWT_ISSUER: 'someone-else' }, appPem, { sub: 'u1', email: 'a@x.com', name: 'Ana' })
    expect((await verifyJwt(verifyCfg(), otherIss)).result).toBeNull()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    const old = await mintAppToken(ENV, appPem, { sub: 'u1', email: 'a@x.com', name: 'Ana' })
    vi.setSystemTime(new Date('2030-01-01T00:20:00Z'))
    expect((await verifyJwt(verifyCfg(), old)).result).toBeNull()
  })
})

// ── The routes, end to end, with Cognito mocked ──────────────────────────

function app() {
  const a = new Hono<AppContext>()
  registerCognitoAuthRoutes(a)
  return a
}
const req = (a: Hono<AppContext>, path: string, init: RequestInit = {}, env: Partial<CognitoEnv> = ENV) =>
  a.request(`https://co-farer.duckdns.org${path}`, init, env as never)
const setCookies = (r: Response) => r.headers.getSetCookie()
const cookieValue = (r: Response, name: string) => setCookies(r).find((c) => c.startsWith(`${name}=`))?.split(';')[0].slice(name.length + 1) ?? ''

/** Mocks Cognito: the token endpoint (code and refresh grants), revoke, and the JWKS. */
function mockCognito(opts: { refresh?: 'ok' | 'rejected' | 'down' } = {}) {
  const calls: Array<{ url: string; form: Record<string, string> }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    const form = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : {}
    calls.push({ url, form })
    if (url === `${ISS}/.well-known/jwks.json`) return Response.json(jwks)
    if (url.endsWith('/oauth2/revoke')) return new Response('')
    if (url.endsWith('/oauth2/token')) {
      if (form.grant_type === 'authorization_code') return Response.json({ id_token: await idToken(), access_token: 'a', refresh_token: 'rt-1', expires_in: 900 })
      if (opts.refresh === 'rejected') return Response.json({ error: 'invalid_grant' }, { status: 400 })
      if (opts.refresh === 'down') throw new TypeError('network down')
      return Response.json({ id_token: await idToken({ name: 'Ana L.' }), access_token: 'a2', expires_in: 900 })
    }
    return new Response('unexpected', { status: 500 })
  }))
  return calls
}

async function signIn(a: Hono<AppContext>, returnTo = '/trip/abc') {
  const login = await req(a, `/auth/login?provider=google&returnTo=${encodeURIComponent(returnTo)}`)
  const state = new URL(login.headers.get('Location')!).searchParams.get('state')!
  const oauth = cookieValue(login, 'cofarer_oauth')
  const cb = await req(a, `/auth/callback?code=the-code&state=${state}`, { headers: { cookie: `cofarer_oauth=${oauth}` } })
  return { login, cb, session: cookieValue(cb, SESSION_COOKIE) }
}

describe('sign-in routes', () => {
  it('signs in: login → Cognito → callback → session cookie → app token', async () => {
    const calls = mockCognito()
    const a = app()
    const { login, cb, session } = await signIn(a)
    expect(login.status).toBe(302)
    expect(new URL(login.headers.get('Location')!).searchParams.get('identity_provider')).toBe('Google')
    expect(setCookies(login)[0]).toMatch(/^cofarer_oauth=.+; Path=\/auth; HttpOnly; SameSite=Lax; Max-Age=600; Secure$/)

    expect(cb.status).toBe(302)
    expect(cb.headers.get('Location')).toBe('/trip/abc')
    expect(session).toBeTruthy()
    const exchange = calls.find((c) => c.form.grant_type === 'authorization_code')!
    expect(exchange.form).toMatchObject({ client_id: CLIENT, code: 'the-code', redirect_uri: 'https://co-farer.duckdns.org/auth/callback' })
    expect(exchange.form.code_verifier).toBeTruthy()

    const s = (await (await req(a, '/api/auth/get-session', { headers: { cookie: `${SESSION_COOKIE}=${session}` } })).json()) as { user: unknown }
    expect(s.user).toMatchObject({ id: 'cognito-sub-1', email: 'ana@example.com', name: 'Ana Lima', image: null })
    expect(JSON.stringify(s)).not.toContain('rt-1')

    const t = await req(a, '/api/auth/token', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${session}` } })
    const { token } = (await t.json()) as { token: string }
    expect((await verifyJwt(verifyCfg(), token)).result?.userId).toBe('cognito-sub-1')
  })

  it('refuses a callback with the wrong state, no state cookie, or a Cognito error', async () => {
    mockCognito()
    const a = app()
    const login = await req(a, '/auth/login?provider=email')
    const oauth = cookieValue(login, 'cofarer_oauth')
    for (const [path, cookieHeader] of [
      ['/auth/callback?code=c&state=wrong', `cofarer_oauth=${oauth}`],
      ['/auth/callback?code=c&state=x', ''],
      ['/auth/callback?error=access_denied', `cofarer_oauth=${oauth}`],
    ] as const) {
      const r = await req(a, path, { headers: { cookie: cookieHeader } })
      expect(r.headers.get('Location')).toBe('/trips?signin=failed')
      expect(cookieValue(r, SESSION_COOKIE)).toBe('')
    }
  })

  it('has no session without a cookie, or with a forged one', async () => {
    const a = app()
    expect(await (await req(a, '/api/auth/get-session')).json()).toBeNull()
    expect((await req(a, '/api/auth/token', { method: 'POST' })).status).toBe(401)
    const forged = await seal(otherPem, { sub: 'admin', email: 'x@x', name: 'x', rt: 'r', chk: Date.now(), iat: Date.now() })
    expect((await req(a, '/api/auth/token', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${forged}` } })).status).toBe(401)
  })

  it('re-checks the account with Cognito after 15 minutes, and signs out a refused account', async () => {
    mockCognito()
    const a = app()
    const { session } = await signIn(a)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + RECHECK_MS + 1000)

    // Account still fine: a fresh cookie with the updated name.
    const calls = mockCognito({ refresh: 'ok' })
    const ok = await req(a, '/api/auth/token', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${session}` } })
    expect(ok.status).toBe(200)
    expect(calls.some((c) => c.form.grant_type === 'refresh_token' && c.form.refresh_token === 'rt-1')).toBe(true)
    const renewed = cookieValue(ok, SESSION_COOKIE)
    expect(await (await req(a, '/api/auth/get-session', { headers: { cookie: `${SESSION_COOKIE}=${renewed}` } })).json()).toMatchObject({ user: { name: 'Ana L.' } })

    // Cognito down: keep the session, ask to try again.
    mockCognito({ refresh: 'down' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const down = await req(a, '/api/auth/token', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${session}` } })
    expect(down.status).toBe(503)
    expect(cookieValue(down, SESSION_COOKIE)).toBe('')

    // Account disabled or signed out elsewhere: refused, cookie cleared.
    mockCognito({ refresh: 'rejected' })
    const gone = await req(a, '/api/auth/token', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${session}` } })
    expect(gone.status).toBe(401)
    expect(setCookies(gone).some((c) => c.startsWith(`${SESSION_COOKIE}=;`) && c.includes('Max-Age=0'))).toBe(true)
  })

  it('signs out: revokes the refresh token, clears the cookie, and ends the Cognito session', async () => {
    mockCognito()
    const a = app()
    const { session } = await signIn(a)
    const calls = mockCognito()
    const r = await req(a, '/auth/logout', { headers: { cookie: `${SESSION_COOKIE}=${session}` } })
    expect(calls.find((c) => c.url.endsWith('/oauth2/revoke'))?.form).toEqual({ token: 'rt-1', client_id: CLIENT })
    expect(setCookies(r).some((c) => c.startsWith(`${SESSION_COOKIE}=;`))).toBe(true)
    const to = new URL(r.headers.get('Location')!)
    expect(to.origin + to.pathname).toBe('https://co-farer.auth.us-east-2.amazoncognito.com/logout')
    expect(Object.fromEntries(to.searchParams)).toEqual({ client_id: CLIENT, logout_uri: 'https://co-farer.duckdns.org/' })
  })

  it('stays out of the way when Cognito isn’t configured (the DeepSpace build)', async () => {
    const a = app()
    a.all('*', (c) => c.text('fell through'))
    for (const [path, method] of [['/auth/login', 'GET'], ['/auth/callback', 'GET'], ['/api/auth/get-session', 'GET'], ['/api/auth/token', 'POST'], ['/api/auth/sign-out', 'POST']]) {
      expect(await (await req(a, path, { method }, { AUTH_JWT_ISSUER: 'x' })).text()).toBe('fell through')
    }
  })
})
