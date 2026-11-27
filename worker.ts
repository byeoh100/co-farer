/**
 * App Worker — explicit assembly for app routes and Durable Objects.
 *
 * Self-hosted (docs/MIGRATION.md, Phase 2d): no DeepSpace platform services.
 * The integrations, file and agent proxies, and the YJS and canvas rooms, are gone.
 *
 * Route implementations live under src/server. Keep their registration order
 * here: specific API and WebSocket handlers must precede the SPA fallback.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  armCronRoom,
  CronRoom,
  JobRoom,
  PresenceRoom,
  RecordRoom,
  resolveAppRole,
  workerErrorHandler,
} from 'deepspace/worker'
import type { DOBindings, DOManifest, Job, JobContext } from 'deepspace/worker'
import { tasks as cronTasks, runTask as runCronTask } from './src/cron.js'
import { runJob } from './src/jobs.js'
import { schemas } from './src/schemas.js'
import { registerActionRoutes } from './src/server/action-routes.js'
import { registerDebugRoutes, registerHealthRoute, registerStaticRoutes, resolveAuth } from './src/server/http-routes.js'
import { registerRealtimeRoutes } from './src/server/realtime-routes.js'
import { registerTestAuthRoutes } from './src/server/test-auth.js'
import type { AiEnv } from './src/lib/ai-provider.js'
import { registerCognitoAuthRoutes, type CognitoEnv } from './src/server/cognito-auth.js'

// Dynamic deploy reads this manifest to create the app's DO bindings.
export const __DO_MANIFEST__ = [
  { binding: 'RECORD_ROOMS', className: 'AppRecordRoom', sqlite: true },
  { binding: 'PRESENCE_ROOMS', className: 'AppPresenceRoom', sqlite: true },
  { binding: 'CRON_ROOMS', className: 'AppCronRoom', sqlite: true },
  { binding: 'JOB_ROOMS', className: 'AppJobRoom', sqlite: true },
] as const satisfies DOManifest

export class AppRecordRoom extends RecordRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, schemas, { ownerUserId: env.OWNER_USER_ID })
  }
}

export class AppPresenceRoom extends PresenceRoom<Env> {}

/** Runs the scheduled tasks defined in src/cron.ts. */
export class AppCronRoom extends CronRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, { tasks: cronTasks })
  }

  protected async onTask(taskName: string): Promise<void> {
    await runCronTask(taskName, this.env)
  }
}

/** Runs durable background work defined in src/jobs.ts. */
export class AppJobRoom extends JobRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, {
      authorizeWrite: async (user) => {
        if (user.userId.startsWith('anon-')) return false
        const role = await resolveAppRole(env, user.userId)
        return role === 'member' || role === 'admin'
      },
    })
  }

  protected async onJob(job: Job, context: JobContext): Promise<unknown> {
    return await runJob(job, context, this.env)
  }
}

/**
 * AiEnv (src/lib/ai-provider.ts): AWS_REGION, BEDROCK_MODEL_ID, the IMDS
 * binding on the server, and local-only AWS_* keys and BRAVE_API_KEY.
 * CognitoEnv (src/server/cognito-auth.ts): COGNITO_*, APP_URL, and the
 * local-only APP_JWT_PRIVATE_KEY.
 */
export interface Env extends DOBindings<typeof __DO_MANIFEST__>, AiEnv, Omit<CognitoEnv, 'AUTH_JWT_ISSUER'> {
  ASSETS: Fetcher
  AUTH_JWT_PUBLIC_KEY: string
  AUTH_JWT_ISSUER: string
  NATIVE_AUTH_REDIRECT_URIS?: string
  APP_NAME: string
  /** Immutable record-scope and platform identity. */
  DEEPSPACE_APP_ID: string
  OWNER_USER_ID: string
  /**
   * Enables /api/debug/* only when exactly "true". The route still requires
   * an authenticated app owner/admin. `npm run workerd` sets it locally.
   */
  ALLOW_DEBUG_ROUTES?: string
  /** Exactly "true" turns on the test-only sign-in (src/server/test-auth.ts). Local and Playwright runs only; never on the server. */
  ALLOW_TEST_AUTH?: string
}

export type AppContext = { Bindings: Env }

const app = new Hono<AppContext>()
app.use('/api/*', cors())
// A Durable Object exists only once something fetches it, and the CronRoom
// arms its alarm in that first fetch — so wake it from the request path, or a
// deployed schedule waits for a visitor. Once per isolate; no-op without tasks.
app.use('*', async (c, next) => {
  armCronRoom(c.executionCtx, c.env.CRON_ROOMS, `app:${c.env.DEEPSPACE_APP_ID}`, cronTasks)
  await next()
})

// Registration order is part of the worker contract: sign-in routes first
// (test-only, then Cognito), static last.
// Test-only sign-in (Phase 2e), inert unless ALLOW_TEST_AUTH=true: never on the server.
registerTestAuthRoutes(app)
// Cognito sign-in (Phase 2b). Inert unless COGNITO_CLIENT_ID is set.
registerCognitoAuthRoutes(app)
registerDebugRoutes(app)
registerHealthRoute(app)
registerRealtimeRoutes(app)
registerActionRoutes(app, resolveAuth)
registerStaticRoutes(app)

// Hono registers ONE error handler (last onError wins), and its default is
// `console.error(err)` — whose message Workers Logs drops, keeping only the
// stack frames. workerErrorHandler logs the string form instead (message
// first, frames and bounded cause chain, method + path for context), keeps a
// response-bearing error's (HTTPException — auth 401s, upload 413s) own
// answer, and returns a generic 500 for the rest.
app.onError(workerErrorHandler('error'))

export default app
