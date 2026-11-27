/**
 * The landing page's redirect (co-farer-landing/LANDING-SPEC.md, §1): a
 * signed-in visitor opening `/` goes straight to `/trips` with a server-side
 * 302, so there's no flash of the landing page, and since the landing page
 * never enters history, Back doesn't bounce. Signed-out visitors (and search
 * engines, link previews) get the real prerendered landing HTML.
 *
 * "Signed in" means a session cookie that decrypts and is still within its
 * lifetime (the HttpOnly Cognito session, or the local-only test sign-in).
 * The account itself is re-checked by /api/auth/token as usual, so a stale
 * cookie just lands on /trips' sign-in screen. Nothing goes in the URL.
 */

import type { Hono } from 'hono'
import type { AppContext, Env } from '../../worker.js'
import { SESSION_COOKIE, appKeyPem, cognitoEnabled, isSession, readCookie, unseal, type CognitoEnv } from './cognito-auth.js'
import { currentTestUser, testAuthEnabled } from './test-auth.js'

export async function hasSignedInSession(env: Env, req: Request): Promise<boolean> {
  if (testAuthEnabled(env) && currentTestUser(req)) return true
  const e = env as unknown as CognitoEnv
  const raw = readCookie(req, SESSION_COOKIE)
  if (!raw || !cognitoEnabled(e)) return false
  const pem = await appKeyPem(e)
  return !!pem && isSession(await unseal(pem, raw))
}

export function registerLandingRedirect(app: Hono<AppContext>): void {
  app.get('/', async (c, next) => {
    if (!(await hasSignedInSession(c.env, c.req.raw))) return next()
    // Vary: Cookie and no-store: the answer depends on who's asking.
    return new Response(null, { status: 302, headers: { Location: '/trips', 'Cache-Control': 'no-store', Vary: 'Cookie' } })
  })
}
