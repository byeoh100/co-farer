/**
 * HTTP routes: bearer-token auth for the API, the local debug proxy, and the
 * static/SPA fallback. Self-hosted (docs/MIGRATION.md, Phases 2d–2e): no
 * DeepSpace proxies remain. Sign-in lives in src/server/cognito-auth.ts (and
 * src/server/test-auth.ts for local tests); any other /api/auth/* path 404s.
 */

import type { Hono } from 'hono'
import { isPlatformReservedPath, resolveAppRole, verifyJwt } from 'deepspace/worker'
import type { JwtVerifierConfig, VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'
import { createActionTools } from './action-routes.js'

function jwtConfig(env: Env): JwtVerifierConfig {
  return { publicKey: env.AUTH_JWT_PUBLIC_KEY, issuer: env.AUTH_JWT_ISSUER }
}

export async function resolveAuth(req: Request, env: Env): Promise<VerifyResult | null> {
  const header = req.headers.get('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  return (await verifyJwt(jwtConfig(env), token)).result
}

/**
 * `/healthz` (docs/MIGRATION.md, Phase 4): "ok" once the data room answers a
 * one-row read, else 503. Deploys wait for it before keeping a release. It
 * says nothing about the data itself.
 */
export function registerHealthRoute(app: Hono<AppContext>): void {
  app.get('/healthz', async (c) => {
    const headers = { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }
    try {
      const probe = createActionTools(c.env, c.env.OWNER_USER_ID).query('trips', { limit: 1 })
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000))
      const res = await Promise.race([probe, timeout])
      if (res && res.success) return new Response('ok', { headers })
    } catch {
      // fall through
    }
    return new Response('unavailable', { status: 503, headers })
  })
}

/** The local debug route (RecordRoom inspection), gated on ALLOW_DEBUG_ROUTES and the admin role. */
export function registerDebugRoutes(app: Hono<AppContext>): void {
  // Debug proxy → app's RecordRoom DO.
  //
  // Both this proxy and the DO gate on ALLOW_DEBUG_ROUTES === "true". The app
  // proxy also requires the existing owner/admin role before reaching the DO.
  app.all('/api/debug/*', async (c) => {
    if (c.env.ALLOW_DEBUG_ROUTES !== 'true') {
      return c.notFound()
    }
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'unauthorized' }, 401)
    if ((await resolveAppRole(c.env, auth.userId)) !== 'admin') {
      return c.json({ error: 'forbidden' }, 403)
    }
    const stub = c.env.RECORD_ROOMS.get(
      c.env.RECORD_ROOMS.idFromName(`app:${c.env.DEEPSPACE_APP_ID}`),
    )
    // Forward verbatim: the DO dispatches on the original pathname.
    return stub.fetch(c.req.raw)
  })
}

const matches = (pathname: string, prefixes: readonly string[]): boolean =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

/**
 * An unmatched API call must 404 without consulting the asset layer at all —
 * answering it with a static file, or with HTML a client then parses as JSON,
 * is never right.
 */
const API_PREFIXES = ['/api']

/**
 * The plain SPA shell prerender.ts (app root) writes beside the prerendered
 * pages: the built index.html with #root still empty. Extensionless, so the
 * asset layer's auto-trailing-slash serves `_spa.html` at it.
 */
const SPA_SHELL_PATH = '/_spa'

/**
 * A FILE, not a client route: last segment carries an extension. Wrong in only
 * the cheap direction — a dotted route 404s visibly, where a missing file
 * getting the shell is HTML parsed as JavaScript and a blank page.
 */
function namesAFile(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1)
  return last.includes('.')
}

/**
 * Register the client-route fallback last so it cannot shadow worker routes.
 * Deploys set `not_found_handling: "none"`, so a 404 from the binding is a
 * real miss and this worker makes the call the asset layer cannot.
 */
export function registerStaticRoutes(app: Hono<AppContext>): void {
  // The API guard is METHOD-AGNOSTIC and sits ahead of the GET fallback, so a
  // POST/PUT/DELETE to a mistyped or rolled-back API route gets the same JSON
  // 404 a GET does — Hono's default would answer it with plain text, which is
  // precisely the "text parsed as JSON" failure this guard exists to prevent.
  // Every non-API path falls through to the asset handling below.
  app.all('*', async (c, next) => {
    if (matches(new URL(c.req.url).pathname, API_PREFIXES)) {
      return c.json({ error: 'not_found' }, 404)
    }
    await next()
  })

  app.get('*', async (c) => {
    const url = new URL(c.req.url)
    const response = await c.env.ASSETS.fetch(c.req.raw)
    if (response.status !== 404) return response

    if (namesAFile(url.pathname) || isPlatformReservedPath(url.pathname)) {
      return c.json({ error: 'not_found' }, 404)
    }
    // Once the prerender has run, `/` is the landing page, not an empty
    // shell — serving it for /home would paint the landing for a frame and
    // hand crawlers the `/` canonical on every app route. Ask for the plain
    // shell the build writes first; a build without it (plain SPA,
    // `deepspace dev`) misses and falls through to `/` exactly as before.
    url.pathname = SPA_SHELL_PATH
    const shell = await c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw))
    if (shell.status !== 404) return shell
    // `/`, not `/index.html`: auto-trailing-slash redirects the explicit
    // filename, and the browser would follow it off the URL it asked for.
    url.pathname = '/'
    return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw))
  })
}
