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

## Phase 2a: AI and search on AWS (2026-11-25)

Research no longer goes through DeepSpace's integration proxy.
`src/actions/engine-ai.ts` calls only `search` and `complete` in
`src/lib/ai-provider.ts`:

| Call | Service | Credentials |
| --- | --- | --- |
| `search(env, plan)` | Brave Search API (`/res/v1/web/search`, up to 20 results, extra snippets, thumbnails) | Key from Parameter Store `/cofarer/brave-api-key` (cached for an hour); `BRAVE_API_KEY` overrides it for local development only |
| `complete(env, req)` | Claude Haiku 5.5 on Amazon Bedrock, Converse API, through the US inference profile `us.anthropic.claude-haiku-5-5` (the only way it runs in us-east-2; approved 2026-11-25) | SigV4 with `aws4fetch`. On the server, the instance role through IMDSv2, reached only through the `IMDS` binding (169.254.169.254:80); locally, `AWS_*` variables from `npm run workerd -- --aws` |

Unchanged: the prompts, the per-module site lists (booking sites for housing;
TripAdvisor, AllTrails and Viator for activities; TripAdvisor and Yelp for
food), the safety checks in `src/lib/research.ts` (no tools, page text wrapped
as untrusted data, sources only from the search results, a missing price stays
null), the local stand-in for `@deepspace.test` accounts, and the 25-call cap.

How the search changed: Brave has no domain filters, so each plan's
`includeDomains` becomes `(site:a OR site:b)` and `excludeDomains` becomes
`-site:a`, inside Brave's 400-character limit. Brave returns snippets rather
than Exa's page text and price highlights, so prices may be found less often
("Price not found" stays the answer when none is stated). A pasted link Brave
doesn't know is searched again as `site:<host>` plus the words in its path.
Photos are Brave's proxied thumbnails (`imgs.search.brave.com`).

Neither call throws: a failure is logged (status or error name, never content)
and the user sees the polite "search failed" / "AI didn't answer" message,
which fixes the Phase 1 HTTP 500.

### Needed before a real Suggest works

- **Blocker (2026-11-25):** every Bedrock model call on this account fails with
  `ValidationException: Operation not allowed`, including Amazon Nova Micro and
  the console playground, and `PutUseCaseForModelAccess` answers "Your account
  is not authorized to perform this action. Please create a support case."
  Bedrock is on the Free plan's supported list, so this is a new-account hold
  that only AWS support can lift (an "Account and billing" case).

- Bedrock: Anthropic's one-time use-case form (Bedrock console, open Claude
  Haiku 5.5 in the playground). Until then `get-foundation-model-availability`
  shows `NOT_AUTHORIZED`.
- ~~A Brave Search API key~~: stored as SecureString `/cofarer/brave-api-key` in us-east-2 (done 2026-11-25).
- Phase 3's instance role needs `bedrock:InvokeModel` on
  `arn:aws:bedrock:us-east-2:<account>:inference-profile/us.anthropic.claude-haiku-5-5`
  **and** `arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-5-5`
  (the profile routes to us-east-1, us-east-2 and us-west-2), plus
  `ssm:GetParameter` on `/cofarer/*` and `kms:Decrypt` for the SSM key.

### Local test with the real AI

The stand-in users (Alice and Bob Stub) always get the free fake AI. A real
call needs a non-test account, which arrives with Cognito in 2b. Until then,
real-AI testing is the unit tests' mocked Brave, SSM and Bedrock calls
(`src/lib/ai-provider.test.ts`), plus one CLI check once access is granted:

```sh
aws bedrock-runtime converse --profile cofarer --region us-east-2 \
  --model-id us.anthropic.claude-haiku-5-5 \
  --messages '[{"role":"user","content":[{"text":"Say ok"}]}]' \
  --inference-config '{"maxTokens":16}'
```

## Decisions (2026-11-25)

Answers to the open questions in docs/MIGRATION.md:

| Question | Decision |
| --- | --- |
| Google sign-in, or email codes only? | **Google sign-in** (with Cognito managed login) |
| Profile picture uploads in v1? | **Initials only** for now. 2c is on hold; the initial-on-a-color fallback already exists. |
| Domain | **co-farer.duckdns.org** (free, from DuckDNS; claimed 2026-11-26). Points at `127.0.0.1` until Phase 3 sets the server's Elastic IP; the DuckDNS token is SecureString `/cofarer/duckdns-token`. co-farer.com was the first pick, dropped to avoid the cost (Route 53 also refuses Free plan accounts). Switching to a bought domain later means changing the Cognito callback and logout URLs and `APP_URL`. |
| Terraform or CDK? | **Terraform** (2026-11-26) |
| Budget | "Co-farer monthly", $5: alerts at 85% and 100% actual, and 100% forecast |

## Phase 2b: sign-in with Cognito (2026-11-25)

### What's in AWS (us-east-2, all free at this size)

| Piece | Value |
| --- | --- |
| User pool | `cofarer` (`us-east-2_DHqzYR5y0`), Essentials tier. Email is the username; sign-in by a one-time email code or a password (no password needed); self sign-up on; Cognito's own email sender (50 emails a day). |
| Sign-in domain | `https://co-farer.auth.us-east-2.amazoncognito.com`, managed login v2 with Cognito's default look |
| App client | `cofarer-web` (`3ofnp5fam86b8s3j10barba1dl`): public (no secret), code grant + PKCE, scopes `openid email profile`; callbacks `http://localhost:8080/auth/callback` and `https://co-farer.duckdns.org/auth/callback`; logout URLs `http://localhost:8080/` and `https://co-farer.duckdns.org/` (co-farer.com removed 2026-11-26); ID and access tokens 15 minutes, refresh 30 days, revocation on |
| Parameter Store | `/cofarer/app-jwt-private-key` (SecureString, the app's ES256 signing key), `/cofarer/app-jwt-public-key`, `/cofarer/cognito-user-pool-id`, `/cofarer/cognito-client-id`, `/cofarer/cognito-domain` |

These were made with the CLI; Phase 3 imports them into the infrastructure code.

### How it works

`src/server/cognito-auth.ts`. The browser keeps the SDK's own session
hooks, which only call same-origin `/api/auth/*` routes; those are now
answered from a Cognito session:

1. **Sign in** (`SignInDialog`: "Continue with Google" or "Sign in with an
   email code") → `/auth/login` → Cognito managed login, with PKCE and a
   state cookie.
2. **`/auth/callback`**: the server exchanges the code, verifies the Cognito
   ID token with `jose` against the pool's public keys (RS256, issuer,
   audience, `token_use=id`), and sets an encrypted HttpOnly session cookie
   (AES-GCM, key derived from the app's signing key) that holds the Cognito
   refresh token. JavaScript never sees a Cognito token.
3. **`/api/auth/token`** mints the app's own **ES256** token (15 minutes;
   `sub`, `name`, `email`, `iss`), signed with `/cofarer/app-jwt-private-key`.
   Every request is checked by the SDK's unchanged `verifyJwt` against
   `AUTH_JWT_PUBLIC_KEY`. At most every 15 minutes this re-checks the account
   with Cognito (refresh grant): a disabled or signed-out account is refused.
4. **Sign out** (`/auth/logout`) revokes the refresh token, clears the
   cookie, and ends the Cognito session so the next sign-in can pick another
   account.

The `users` row is created by the data room from the token's `name` and
`email` on first connect (checked: presence shows the Cognito name). User IDs
are Cognito `sub` values, so the new site starts with no trips. Profile
pictures: initials only (`image` is always null).

Differs from the spec: no `POST /auth/exchange` and no new browser auth
provider. The code exchange happens on the server instead, so the refresh
token stays in an HttpOnly cookie rather than browser storage, and the SDK's
existing hooks keep working unchanged.

### Running it locally

`npm run build && npm run workerd`, then **Sign in** on http://localhost:8080.
Locally the app signs its tokens with the local key in `.workerd-data`, so no
AWS access is needed to sign in. The Phase 1 stand-in users still work at
`/api/auth/stub-login`, side by side.

`node scripts/workerd-smoke.mjs --cognito users.json` runs the two-browser
check with two real pool users signed in through Cognito's page (see the
script for the file format; it passed on 2026-11-25 with two temporary
`@deepspace.test` users, since deleted).

### Server environment (Phase 3)

`COGNITO_DOMAIN`, `COGNITO_CLIENT_ID`, `COGNITO_USER_POOL_ID` (from the
`/cofarer/cognito-*` parameters), `APP_URL=https://co-farer.duckdns.org`,
`AUTH_JWT_PUBLIC_KEY` (from `/cofarer/app-jwt-public-key`),
`AUTH_JWT_ISSUER=https://co-farer.duckdns.org`. Never `APP_JWT_PRIVATE_KEY`,
`LOCAL_STUB_AUTH` or `ALLOW_DEBUG_ROUTES`. The instance role also needs
`ssm:GetParameter` on `/cofarer/app-jwt-private-key`.

### Google sign-in (set up 2026-11-26)

- Google Cloud: OAuth client `244031744732-eti0obgm35drcss55km0kdftoaamnovt.apps.googleusercontent.com`
  (Web application), JavaScript origin `https://co-farer.auth.us-east-2.amazoncognito.com`,
  redirect URI `https://co-farer.auth.us-east-2.amazoncognito.com/oauth2/idpresponse`,
  scopes `openid email profile`, authorized domain `amazoncognito.com` (`duckdns.org` can't be added: Google
  refuses shared domains like it, and it isn't needed, since Google only redirects to Cognito). While the consent screen is in "Testing", only its listed test users can
  sign in with Google.
- Secret: SecureString `/cofarer/google-client-secret`.
- Cognito: identity provider `Google` (maps `email`, `email_verified`, `name`; username = Google
  `sub`), added to the `cofarer-web` client (`COGNITO` + `Google`). The client was updated
  read-modify-write, since that API replaces every field.
- Note: a Google account and an email-code account with the same address are two separate
  Co-farer users (Cognito doesn't link them). Pick one way to sign in and stick with it.

## Phase 2d: DeepSpace platform plumbing removed (2026-11-26)

Gone from the worker, `deploy/workerd.capnp` and `scripts/workerd-run.mjs`:

| Removed | What it was | Now |
| --- | --- | --- |
| `API_WORKER*`, `APP_OWNER_JWT`, `/api/integrations/*`, `src/integrations.ts` | DeepSpace's metered integrations proxy and billing modes | AI research calls AWS directly (2a). `tools.integration` always refuses. |
| `PLATFORM_WORKER*`, `APP_IDENTITY_TOKEN`, `/api/files/*`, `useR2Files` | DeepSpace file storage (profile pictures) | Initials only. The profile page no longer uploads; saving clears an old picture link. `PictureCropper` and `src/lib/crop.ts` stay for 2c. |
| `/_deepspace/*` | Browser proxy to DeepSpace's API | Nothing used it |
| `/api/auth/native-*` | Expo/native-app sign-in | No native app |
| `src/ai/*` (agent, MCP and chat routes) | DeepSpace's assistant and agent-tool routes | Nothing used them |
| `AppYjsRoom`, `AppCanvasRoom` (`YJS_ROOMS`, `CANVAS_ROOMS`, `/ws/yjs`, `/ws/canvas`) | Collaborative-document rooms | Never used. `wrangler.toml` has a `v2` migration deleting them, for the local `deepspace dev` run only (this branch is never deployed to DeepSpace). Old local workerd folders for them are simply ignored. |
| `/api-status` page and its two starter tests; the picture-cropper e2e test | Starter debug page; picture upload | Features removed |

Still there until 2e: DeepSpace's `/api/auth/*` proxy (`AUTH_WORKER_URL`), which
only the `deepspace dev`/`test` run uses, so the e2e tests can sign in. It
answers only when `AUTH_WORKER_URL` is set and Cognito isn't configured, so
it is inert under `npm run workerd` and on the server.

`cleanupMyTestTrips` is now gated on a local environment variable
(`ALLOW_DEBUG_ROUTES === "true"`, never set on the server) instead of
DeepSpace test-account emails; it still touches only the caller's own trips
older than 15 minutes.
