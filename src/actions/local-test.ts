/**
 * The one switch for local-test-only behavior (the AI stand-in and test
 * cleanup). True only when BOTH hold:
 *  - the server is local: ALLOW_DEBUG_ROUTES is "true", which only
 *    `deepspace dev` / `deepspace test` set (never the live site);
 *  - the caller is a @deepspace.test test account.
 * Real accounts, and everyone on the live site, never get it.
 */

import { isTestAccountEmail } from 'deepspace/worker'
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'

export async function isLocalTestAccount(env: Env, tools: ActionTools, userId: string): Promise<boolean> {
  if (env.ALLOW_DEBUG_ROUTES !== 'true') return false
  const user = await tools.get<{ email?: string }>('users', userId)
  return user.success && isTestAccountEmail(user.data.record.data.email)
}
