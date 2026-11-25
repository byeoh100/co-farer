# Co-farer: AWS Migration Spec

> Copy of the [Co-farer: AWS Migration Spec](https://claude.ai/artifact/5xxwzVGzzYhEXyPQJVfHVr) doc (the architecture diagram is there). If this copy and the doc disagree, the doc wins.

Move Co-farer from DeepSpace to one EC2 server running the same code on `workerd`, replacing DeepSpace's sign-in, AI proxy and file storage with AWS services. Done phase by phase, each with a "done when" check; Phase 1 decides whether the rest goes ahead.

## Goal and rules

**Goal:** the same Co-farer, with the same features, data model and tests, running on infrastructure you own on AWS, at about $17–20 a month and covered by credits for roughly the first year.

**Rules for the coding agent:**

- Work on a `self-host` branch. **Never touch the live DeepSpace app or its deploy** until Phase 5.
- Do **one phase at a time**. Each phase ends with its "done when" checks passing and a short report to the human, before the next starts.
- **Phase 1 is a gate.** If it fails, stop and report. Don't work around it by rewriting the data layer.
- **Keep every privacy and security rule.** All writes still go through server actions with membership checks, and budgets stay owner-only. The AI safety rules and the 25-call cap stay too.
- **No secrets in the repo.** Keys live in AWS Systems Manager Parameter Store, and the server reads them through its IAM role.
- **Pin the `deepspace` package** to the version in use (0.44.2). Don't upgrade it during the migration.
- Log each phase in `PLAN.md` §9, as before: what the agent did, and what the human verified.

## Target architecture

Browser → Caddy (HTTPS) → `workerd` running the app worker and its Durable Objects (data rooms, presence, cron) → SQLite files on an encrypted EBS disk, all on one EC2 t4g.small. The worker reaches Bedrock, Cognito, S3, Parameter Store and CloudWatch through the server's IAM role, so there are no AWS keys in the code. Brave Search is the only outside service, and its key lives in Parameter Store. GitHub Actions deploys through SSM.

## Phase 0: AWS account prep (human, about 1 hour)

1. Create a **new** AWS account, so it qualifies for the new-customer credits, and choose the **Free plan**.
2. Turn on MFA for the root user. Create an IAM Identity Center (or IAM) admin user, and use that from now on.
3. Create an **AWS Budget alert at $5 per month**, with email alerts at 80% and 100%.
4. Pick one region for everything, for example `us-west-2` (Oregon), the closest to you.
5. In the Bedrock console, request access to **Claude Haiku 5.5** in that region.
6. Earn the extra credits by doing the starter activities as they come up: launching EC2, creating a budget, trying the Bedrock playground.
7. If you're a veteran, claim the AWS Educate credits through SheerID, and check whether they can be applied to this account.
8. Get a Brave Search API key.
9. Choose a domain name. You'll register it in Phase 3, through Route 53 or any registrar.

**Done when:** you can sign in as the admin user with MFA, the budget alert exists, and Bedrock shows Haiku 5.5 as "Access granted".

**Before switching to the Paid plan:** a Free plan account ends six months after opening. To keep the server running past that, switch to the Paid plan before month six; your remaining credits keep applying until they expire at month 12.

## Phase 1: Go/no-go — run Co-farer on `workerd` locally (agent, 1 day)

The question to answer: can the existing app, with its DeepSpace SDK data rooms, run on plain `workerd` with no DeepSpace servers behind it? Everything after this depends on the answer.

1. **Bundle the worker.** Produce the built server bundle and frontend assets, using the app's existing build, or `wrangler deploy --dry-run --outdir`. Don't deploy anything.
2. **Write `deploy/workerd.capnp`:**
   - One service for the app worker. Its modules are the bundle, with the compatibility date and flags copied from `wrangler.toml`.
   - The six Durable Object classes from `wrangler.toml` (`AppRecordRoom`, `AppPresenceRoom`, `AppCronRoom` and the rest) as `durableObjectNamespaces`, each with `enableSql = true` and a fixed `uniqueKey`.
   - `durableObjectStorage = (localDisk = "do-storage")`, pointing at a writable disk service, `/var/lib/cofarer/do` on the server and `./.workerd-data` locally.
   - Serve the built frontend for the `ASSETS` binding, either as a disk service or by letting Caddy serve static files. Check that routes like `/trip/abc` still fall back to the app's `index.html`.
   - An outbound network service so the worker can make HTTPS calls out.
3. **Stub sign-in** with a local ES256 key pair. Set `AUTH_JWT_PUBLIC_KEY` and `AUTH_JWT_ISSUER` to match, and mint two test tokens for two fake users. Read `verifyJwt` in the SDK first, to see which claims it requires.
4. **Stub the DeepSpace platform variables** (`API_WORKER_URL`, `PLATFORM_WORKER_URL`, `APP_OWNER_JWT`). Write down every place that breaks without them.
5. Run `workerd serve deploy/workerd.capnp` and test with two browsers.

**Done when all of these pass:**

- [ ] Two fake users can create a trip, join it, set budgets and vote, and each sees the other's changes live.
- [ ] Stopping and restarting `workerd` keeps every trip, vote and note.
- [ ] The online profile circles work.
- [ ] A housing deadline set one minute ahead auto-locks, which proves cron and alarms run under `workerd`.
- [ ] A written list of every SDK call that needs a DeepSpace server, and what replaces it in Phase 2.

**Stop and report if:** the data rooms can't start, data doesn't survive a restart, or a core feature depends on a DeepSpace server with no workable replacement. The fallback is the human's own Cloudflare account, with the same Phase 2 changes and no EC2 work.

## Phase 2: Replace the DeepSpace pieces (agent, 3–5 days)

Do these in order and commit each separately. After each one, run all the unit tests, and they must still pass.

### 2a. AI and search (half a day)

- Create `src/lib/ai-provider.ts` with two functions, `search(query, opts)` and `complete(messages, opts)`. Change `src/actions/engine-ai.ts` to call only these.
- **`complete`:** Claude Haiku 5.5 on **Amazon Bedrock**, through the Converse API.
  - Sign requests with AWS Signature V4, using a small fetch-based signer such as `aws4fetch`, so it runs in `workerd`.
  - Take credentials from the EC2 instance role through the instance metadata service (IMDSv2). This needs the outbound network service to allow that address. Locally, use the developer's own AWS credentials.
  - Keep the existing safeguards exactly: no tools, page text marked as untrusted, sources limited to search results, and "Price not found" instead of a guess.
- **`search`:** the Brave Search API, with its key read from Parameter Store at `/cofarer/brave-api-key`.
  - Keep the site-priority lists per module: booking sites for housing; TripAdvisor, AllTrails and Viator for activities; TripAdvisor and Yelp for food.
  - Optional, later: a Google Hotels data API for housing prices.
- The per-trip cap of 25 research calls, and how it's counted, don't change.

**Done when:** Suggest works for housing, activities and food, with the same card fields as before, and unit tests cover the provider's response parsing.

### 2b. Sign-in with Cognito (2–3 days)

- **Cognito user pool**, Essentials tier, with managed login. Sign in by email code or Google. Add one app client with a redirect to `https://<domain>/auth/callback`.
- **Token exchange.** Add a new route, `POST /auth/exchange`:
  1. Verify the Cognito ID token with `jose` against the pool's public keys (RS256).
  2. Issue the app's own **ES256** token, with the claims the SDK's `verifyJwt` expects, signed with a private key read from `/cofarer/app-jwt-private-key`.
  3. Set `AUTH_JWT_PUBLIC_KEY` and `AUTH_JWT_ISSUER` to match.
  - Keep tokens short-lived (15 minutes), and refresh them through Cognito.
- **Browser.** Replace the DeepSpace pieces (`DeepSpaceAuthProvider`, `AuthOverlay`, `useAuthStatus`, `useUser`, `signOut`, `getAuthToken`) with a small local auth provider that does three things:
  - starts Cognito sign-in;
  - calls `/auth/exchange`;
  - gives the existing `RecordProvider` its token.
- **User profile.** Confirm how the SDK fills in the `users` row (name, email, picture) from token claims. Make sure first sign-in creates it.
- **Fresh start.** DeepSpace user IDs don't carry over, so the new site starts with no trips.

**Done when:** two real Cognito accounts can sign in, sign out, and use every module. A request with no token, an expired token or a forged one is refused. The schema tests and privacy tests still pass.

### 2c. Profile pictures (half a day)

- Replace `useR2Files` with S3 uploads. A server action checks the user, then returns a short-lived presigned upload URL for `s3://<bucket>/avatars/<userId>`, with a 2 MB limit and image types only.
- Serve the pictures through the app route, or a CloudFront URL if one is added later.
- If this runs long, ship initials-only avatars first; the fallback already exists.

### 2d. Remove DeepSpace platform plumbing (half a day)

- Remove `API_WORKER`, `PLATFORM_WORKER`, `APP_IDENTITY_TOKEN`, `APP_OWNER_JWT`, the billing paths and the unused agent-tool routes. Remove the YJS and canvas rooms too if nothing uses them.
- Keep the test-only cleanup action, but gate it on a local environment variable rather than DeepSpace test accounts.

### 2e. Tests (1 day)

- Unit tests run unchanged: `npm run validate`.
- **Move the end-to-end tests off `deepspace test`.** They become plain Playwright against the local `workerd` server, with two users signed in through a test-only token route.
  - That route is enabled only when `ALLOW_TEST_AUTH=true`, and is never set on the server.
  - Add a test that proves the route is refused when that variable is off.

**Done when:** `npm run validate` and the new end-to-end suite pass locally, covering the same flows as the 26 existing end-to-end tests.

## Phase 3: AWS infrastructure (agent and human, 1–2 days)

Write all of this as code in `infra/`, using **Terraform** or **AWS CDK**, so it can be rebuilt from scratch. The human runs `apply` with their own credentials, and the agent never holds AWS keys.

| Piece | Setup |
| --- | --- |
| EC2 instance | `t4g.small` (Arm, 2 vCPU, 2 GB), Amazon Linux 2023 arm64, in the chosen region |
| Disk | 20 GB gp3, encrypted. The app's data lives at `/var/lib/cofarer/do`. |
| Public address | One Elastic IP, with the domain's A record pointing at it (Route 53 or your registrar) |
| Security group | Inbound 80 and 443 only. **No port 22.** |
| Server access | **SSM Session Manager** (the `AmazonSSMManagedInstanceCore` policy on the instance role) |
| IAM instance role | Least privilege: invoke the one Bedrock model; read `/cofarer/*` parameters; read and write the avatar and backup S3 prefixes; write CloudWatch logs |
| Secrets | SSM Parameter Store, SecureString: `/cofarer/brave-api-key`, `/cofarer/app-jwt-private-key`, `/cofarer/cognito-*` |
| HTTPS | **Caddy** as a reverse proxy, with automatic Let's Encrypt certificates, forwarding to `workerd` on `127.0.0.1:8080`. WebSocket upgrades must pass through. |
| App process | `workerd` as a `systemd` service: `Restart=always`, its own user, and read-only access to everything except the data folder. Optionally ship one binary built with `workerd compile`. |
| Logs | CloudWatch agent sending the `workerd` and Caddy logs, kept 30 days. An alarm on instance status-check failures emails the human. |
| Backups | **Daily EBS snapshots** through Data Lifecycle Manager, kept 7 days. Plus a **nightly copy to S3** at 4 am: stop `workerd`, archive the data folder, upload it, restart, a few seconds of downtime. Keep 14 days with an S3 lifecycle rule. |
| Patching | `dnf-automatic` security updates, with a weekly reboot window of Sunday at 4:30 am |
| Sign-in | The Cognito user pool and app client from 2b, defined in the same infrastructure code |

**Done when:**

- [ ] `https://<domain>` serves Co-farer with a valid certificate.
- [ ] Two real accounts pass the two-browser checklist on the live server.
- [ ] Rebooting the instance brings the app back by itself, with all data intact.
- [ ] One snapshot and one S3 backup exist.
- [ ] Nothing answers on port 22, and the app's secrets aren't in the repo or on the server's disk in plain text.

## Phase 4: Push-to-deploy (agent, half a day)

Add `.github/workflows/deploy.yml`, which runs on every push to `main`:

1. `npm ci`, `npm run validate` and the end-to-end suite. If any of them fail, the deploy stops.
2. Build the bundle (or the compiled `workerd` binary) and upload it to `s3://<bucket>/releases/<git-sha>/`.
3. Use **SSM Run Command** to tell the instance to download that release, swap it in, restart `workerd`, and check `/healthz` until it answers. If it doesn't answer within 60 seconds, put the previous release back.

GitHub authenticates to AWS with **OpenID Connect**: a deploy role trusted only for this repo's `main` branch, with no stored AWS keys. The role may only upload to `releases/` and send commands to the one instance.

Also add a `/healthz` route that answers "ok" once the data rooms are reachable.

**Done when:** a small visible change pushed to `main` appears on the live site within about 5 minutes, and a deliberately broken release rolls back by itself.

## Phase 5: Switchover (human, after the DeepSpace review ends)

1. **Restore test.** Restore last night's S3 backup onto a temporary second instance. Check that the trips are there, then terminate it.
2. **Final checklist** on the new domain, with two accounts on desktop and phone, covering every module.
3. **Update the README and the landing page** with the new URL.
4. Share the new link with your Cachuma group. Everyone signs in fresh, since accounts don't carry over.
5. **Retire DeepSpace** only once you're happy. Keep the DeepSpace version of the code on its own branch for your portfolio.

**Done when:** real trips are being planned on the new site, and the restore test has passed once.

## Risks and open questions

| Risk | What it means | Mitigation |
| --- | --- | --- |
| `workerd` disk storage is labelled experimental | Data on disk could be lost or corrupted in an edge case | Daily snapshots, nightly S3 copies, and a restore test before switchover |
| One server | A reboot or AWS issue means minutes of downtime | Acceptable for a friends app. Auto-restart, plus a status alarm. |
| The SDK may need DeepSpace servers somewhere unexpected | Phase 2 could grow | Phase 1 lists every such call. Stop if one is core and can't be replaced. |
| Bedrock access from inside `workerd` | The worker has to reach the instance-role credentials | Confirm in Phase 1. If blocked, use a tiny local credentials helper on the server. |
| Free credits may not cover Claude on Bedrock | Claude on Bedrock is billed through AWS Marketplace | About $1 a month at current usage. Check the credit terms. |
| Credits end | About $17–20 a month afterwards | Budget alert from day one |
| SDK upgrades | Newer `deepspace` versions may assume DeepSpace's platform | Pin 0.44.2. Upgrade only with a Phase 1-style test. |

**Open questions for the human:**

- Terraform or CDK?
- Google sign-in, or email codes only?
- Profile picture uploads in v1, or initials only?
- Which domain name?

## Monthly cost

About **$19 a month**, paid from the new-account credits ($100 at signup, up to $100 more) for roughly 6–12 months. A t4g.small is also free through Dec 31, 2026.

| Item | Per month |
| --- | --- |
| EC2 t4g.small, on demand | $12.26 |
| Elastic IP (public IPv4) | about $3.65 |
| 20 GB gp3 disk, plus snapshots and S3 backups | about $2 |
| Domain | about $1 (around $15 a year) |
| Claude Haiku 5.5 on Bedrock, plus Brave search | under $1 at friend-group use; Brave includes $5 a month in credit |
| Cognito (up to 10,000 monthly users) | $0 |
| CloudWatch logs and alarm | under $1 |

At about 500 trips a month, AI and search rise to roughly $45, and the server stays the same.

Sources: [AWS Free Tier terms](https://aws.amazon.com/free/terms) · [EC2 T4g free trial](https://aws.amazon.com/ec2/instance-types/t4/) · [Cognito pricing](https://aws.amazon.com/cognito/pricing/) · [Brave Search API pricing](https://api-dashboard.search.brave.com/documentation/pricing)

## Prompts for Claude Code

Save this file as `docs/MIGRATION.md` in the repo first. Then paste one prompt per phase.

**Phase 1:**

```text
Read docs/MIGRATION.md (Goal and rules, Phase 1). On a new branch called self-host, do Phase 1 only: get Co-farer running on workerd locally with Durable Objects on local disk. Send me your plan first. Report every SDK call that needs a DeepSpace server, then go through the Phase 1 "done when" list with me. If it fails, stop and tell me why. Don't work around it.
```

**Phase 2** (send one part at a time: 2a, then 2b, and so on):

```text
Read docs/MIGRATION.md, Phase 2, part <2a|2b|2c|2d|2e>. Do only that part. Plan first, then build, keeping every privacy and security rule from PLAN.md §2. Run npm run validate after each step, and give me a checklist to test with two accounts.
```

**Phase 3:**

```text
Read docs/MIGRATION.md, Phase 3. Write the infrastructure as <Terraform|CDK> in infra/, with least-privilege IAM and no SSH. Don't run apply; tell me the exact commands to run with my own credentials, then walk me through the Phase 3 "done when" checks.
```

**Phase 4:**

```text
Read docs/MIGRATION.md, Phase 4. Add the GitHub Actions deploy, using OIDC with no stored AWS keys, health-check rollback, and a /healthz route. Plan first, and show me how to test the rollback.
```

After each phase, ask Claude Code to add a row to the agent log in `PLAN.md` §9, and fill in the "I verified / changed" column yourself.
