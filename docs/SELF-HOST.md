# Self-hosting notes (docs/MIGRATION.md)

## Phase 1: Co-farer on plain `workerd` (2026-11-23)

**Result: go.** The app, with its DeepSpace SDK data rooms (0.44.2, unchanged),
runs on plain `workerd` with no DeepSpace servers behind it.

### How to run it

```sh
npm run build
npm run workerd                 # http://localhost:8080
open http://localhost:8080/api/auth/stub-login    # sign in as Alice or Bob
node scripts/workerd-smoke.mjs  # two headless browsers, end to end
```

| File | What it is |
| --- | --- |
| `deploy/workerd.capnp` | The app worker (the normal `vite build` bundle), its six Durable Object classes with SQLite on local disk, the assets, and outbound internet. Every key and identity comes from environment variables, never the file. |
| `deploy/assets-worker.js` | The `ASSETS` binding: workerd's disk service lists folders and sends no content types, so this small worker behaves like Cloudflare's asset layer (`index.html` for folders, a real 404 on a miss, content types, the `_headers` security headers, long caching for `/assets/`). |
| `scripts/workerd-run.mjs` | Makes a local ES256 key pair once (`.workerd-data/stub-auth.json`, gitignored), sets the environment, points DeepSpace's platform URLs at a closed port, and runs `workerd serve`. Data lives in `.workerd-data/do`. |
| `src/server/stub-auth.ts` | Phase 1 stand-in sign-in for two fake users, only when `LOCAL_STUB_AUTH=true`. Otherwise every route passes straight through to the real DeepSpace ones (the 26 DeepSpace end-to-end tests still pass). Phase 2b replaces it with Cognito. |
| `scripts/workerd-smoke.mjs` | The two-browser check below, automated with Playwright. |

### "Done when" checks

| Check | Result |
| --- | --- |
| Two users create a trip, join it, set budgets and vote, each seeing the other's changes live | Pass: `workerd-smoke.mjs` (create, invite link, join, budget shown live, dates lock live, Suggest via the free stand-in, votes live both ways, a note live) |
| Stopping and restarting `workerd` keeps every trip, vote and note | Pass: rows counted in the SQLite files before and after a restart; actions keep working on the old trip |
| Online profile circles | Pass: Alice sees Bob's circle as online |
| A housing deadline set ahead auto-locks (cron and alarms) | Pass: a deadline at 06:13:16 locked the top option at 06:18:39, the moment the 15-minute cron alarm fired. That alarm was armed before `workerd` was restarted, so alarms survive restarts; later runs kept coming every 15 minutes |
| A list of every SDK call that needs a DeepSpace server | Below |

Sign-in checks too: a request with no token, or a forged one, is refused (401).

### What still needs a DeepSpace server, and its Phase 2 replacement

| Needs | Where in the code | Without it | Replaced in |
| --- | --- | --- | --- |
| Auth worker (`AUTH_WORKER_URL`) | `src/server/http-routes.ts`: `/api/auth/*` proxy, `social-redirect`, `oauth-complete`, `sign-out`, native-app sign-in | No sign-in at all (the Phase 1 stub stands in) | 2b: Cognito + `/auth/exchange` |
| Browser auth client | `deepspace` exports used in `src/pages/_app.tsx`, `(app)/_layout.tsx`, `(protected)/_layout.tsx`, `Navigation.tsx`, `settings.tsx`, `trip/[id]/_layout.tsx`, `src/lib/actions-client.ts` (`DeepSpaceAuthProvider`, `AuthOverlay`, `useAuthStatus`, `useUser`, `signIn`, `signOut`, `getAuthToken`; Better Auth's `get-session` and `token` endpoints underneath) | Sign-in screen and the session | 2b: a small local auth provider |
| Integrations proxy (`API_WORKER_URL`, `APP_OWNER_JWT`) | `tools.integration('exa/search' / 'anthropic/chat-completion')` in `src/actions/engine-ai.ts`, through `src/server/action-routes.ts`; `/api/integrations/*` in `http-routes.ts` | Real AI research. **Under workerd an unreachable integration throws an internal error (HTTP 500)** instead of the app's polite "search failed" message | 2a: Brave + Bedrock behind `src/lib/ai-provider.ts` |
| Platform files (`PLATFORM_WORKER_URL`, `APP_IDENTITY_TOKEN`) | `/api/files/*` proxy in `http-routes.ts`; `useR2Files` on the profile page (`settings.tsx`) | Uploading or showing profile pictures (initials still show) | 2c: S3 presigned uploads |
| AI chat / agent routes | `src/ai/agent.ts`, `src/ai/chat-routes.ts` (DeepSpace AI streaming) | Nothing Co-farer uses | 2d: remove |
| `composio`, integration status, native-app routes | `action-routes.ts`, `http-routes.ts` | Nothing Co-farer uses | 2d: remove |

Runs fine with no DeepSpace server: live records and their permission rules,
server actions and membership checks, presence, the cron room, app roles
(read from the app's own data room), `verifyJwt`.

### Notes for later phases

- The stand-in sign-in tokens use the same claims the real ones need: `sub`,
  `name`, `email`, `iss`, `exp` (ES256). The data room creates each user's
  row from `name` and `email` when they first connect.
- `OWNER_USER_ID` must be set: the cron task runs as that identity.
- `--experimental` is needed for SQLite Durable Objects on local disk.
