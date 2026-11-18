# Trip Quorum — build plan

A trip room where a group actually **decides**. Each person privately sets a
budget and needs; options get researched with sources; everyone votes live;
the organizer locks decisions into a final plan. The group sees how well an
option fits ("over budget for 2 of 5") without anyone exposing their number.

Target: deployed at `trip-quorum.app.space` (subdomain = `name` in
`wrangler.toml`; rename there before first deploy if you want another).

---

## 1. Scope

**The important path (must be solid with 2+ real users):**

1. Sign in → create a trip → share invite link.
2. Friend opens link → joins → sets private constraints.
3. Anyone adds a decision ("Where do we stay?") and options (name or URL).
4. "Research" on an option → sourced summary + estimated price → group-fit badge.
5. Members toggle approval votes; tallies and who's-here update live.
6. Organizer locks a decision (or cron locks it at the deadline) → it appears on
   the trip's final plan. Non-voters get an email nudge before the deadline.

**Explicitly out (goes in the writeup as "next"):** expense splitting,
day-by-day itinerary, flights/booking, maps, Google Calendar availability,
mobile app, ranked-choice voting, comments/chat per option.

**Why approval voting, not ranked-choice:** one tap per option, trivially
explained tallies, no tie-break algorithm to debug. Ranked-choice is a
contained follow-up (votes gain a `rank` column; tally changes; UI changes).

---

## 2. Main tradeoff (draft for the writeup)

**All trip writes go through server actions instead of direct record writes.**
DeepSpace's `'team'` read rule gives per-trip isolation for free, but `create`
is a plain boolean with no membership check — a client could insert an option
into any trip whose id it knows. Routing writes through actions lets me enforce
membership, "no votes after lock", "organizer-only lock" and "one vote per
member" in one place. Cost: each write is a round trip instead of an optimistic
local write, so voting feels slightly less instant. Reads stay on live
subscriptions, so everyone still sees changes in real time.

Second tradeoff: **group fit shows counts, never names.** Less precise than
"Alice can't afford it," but it is the reason people will enter honest numbers.

---

## 3. Data & access model

All collections live in the single app RecordRoom (`app:<APP_ID>`). A trip is
a "team"; the SDK's `'team'` permission reads membership from `team_members`
(`teamId`, `userId`, `status` = `active` or null). Schemas:
`src/schemas/trip-schemas.ts`.

| Collection | Read | Client writes | Notes |
|---|---|---|---|
| `trips` | team (`teamField: '_rowId'`) | none | `organizerId`, `inviteCode`, `researchCallsUsed` |
| `team_members` | team | none | `tripRole` organizer/member, `hasConstraints` flag (not values) |
| `constraints` | **own** (`ownerField: 'userId'`) | none | budget, dietary, mobility, dealbreakers |
| `decisions` | team | none | `status` open/locked, `deadline`, `winningOptionId`, `reminderSentAt` |
| `options` | team | none | `research` JSON, `groupFit` JSON (aggregates only) |
| `votes` | team | none | `uniqueOn: [optionId, userId]` |

- Admins get **no** extra read rights on trip data. The app owner can't read
  anyone's budget through the app.
- Unit tests (`src/schemas.test.ts`) pin these rules and run the SDK's
  `lintSchemas` — currently clean.

**Known platform behaviours to design around (found reading the SDK 0.44.2 source):**

- The team query clause is `tripId IN (my trips) OR _created_by = me`. Rows
  created by an action carry the caller as creator, so a member who leaves
  still sees rows they created. Acceptable; noted.
- `notifyTeamMembershipChange` reads `record.data.UserId` (capital U), but
  record data is keyed by column name (`userId`). Likely result: after
  `joinTrip`, the joiner's open subscriptions are **not** refreshed, so the
  trip looks empty until reconnect. **Workaround:** after a successful join,
  remount the `RecordScope` (change its `key`) or navigate with a full reload.
  **Verify on day 1** with two browsers; if confirmed, report it upstream and
  mention it in the writeup.

---

## 4. Server actions (`src/actions/`)

Every action starts with `requireMember` / `requireOrganizer`
(`src/actions/trip-access.ts`, done). Actions run RBAC-off, so this is the
security boundary for writes. The caller is `ctx.userId` (from the verified JWT), never a param.

| Action | Who | Invariants |
|---|---|---|
| `createTrip` | any signed-in | creates trip + organizer `team_members` row; random 10+ char invite code |
| `joinTrip` | any signed-in | looks up by `inviteCode`; idempotent; reactivates `left` |
| `leaveTrip` | member | organizer can't leave (v1) |
| `rotateInviteCode` | organizer | |
| `createDecision` | member | deadline optional, must be future |
| `addOption` | member | decision must be open; URL validated (http/https only) |
| `toggleVote` | member | decision open; one row per (option,user) |
| `lockDecision` | organizer | picks given option or current top tally; tie → refuse and ask organizer to pick |
| `setMyConstraints` | member | upserts own row; sets `hasConstraints` on membership; then `refreshGroupFit` for open decisions |
| `researchOption` | member | per-trip cap (e.g. 25 calls); sets `running` → `done`/`failed` |
| `refreshGroupFit` | member | reads constraints RBAC-off **filtered to active members**, writes `computeGroupFit` output |

Group fit math is a pure function, `src/lib/group-fit.ts` (done, with tests
asserting no user ids or individual budgets appear in output). Under 3
responders the UI softens the message ("not enough responses yet") since
counts could identify someone.

---

## 5. AI & integrations

Check exact shapes first: `npx deepspace integrations info exa/search`,
`… anthropic/chat-completion`, `… email/send`.

**`researchOption` pipeline:**
1. `exa/search` with the option title (+ trip destination hint), a few results.
2. `anthropic/chat-completion`: instructions say to treat page text as
   **untrusted data**, extract only `{ summary, estPricePerPerson, pros[],
   cons[], accommodates[], sources[] }` as JSON, and cite only URLs that
   appear in the search results. Validate with zod; on failure → `failed`.
   No tools are given to this model call, so injected page text can't trigger
   actions.
3. Store `research`, run group fit, set `done`. Cache: re-research only on an
   explicit "refresh".

**Agent tools (`src/ai/tools.ts` → `registerAgent`)**: add three app tools
that wrap actions (`trip_overview`, `group_fit`, `research_option`) so the in-app
assistant and a local agent (`npx deepspace agent invoke trip-quorum …`)
share one definition. Trim the built-in allowlist to read tools — writes are
already blocked by RBAC, but a smaller tool list is clearer. Tools run as the
caller, so the agent **cannot** read other people's constraints. Test this
explicitly by asking the agent "what is Alice's budget?"

**Cron (`src/cron.ts`)**, every 15 minutes, idempotent:
- open decisions with a deadline in under 24h and no `reminderSentAt` → `email/send` to
  members with no vote on that decision (`reply_to` = organizer email); set
  `reminderSentAt`.
- open decisions past deadline → lock with top option (tie → leave open,
  email organizer).

**Deliberately not used:** payments (nothing to sell or book), fal images
(decoration, not decisions), Google OAuth calendar (each user must grant consent; the best follow-up
for date-picking), Composio, messaging feature (public channels only by
design, per SDK docs — would leak across trips), Yjs documents (no shared
long-form text to co-edit).

---

## 6. Pages (`src/pages/`)

- `index.tsx` (static landing, replace starter copy)
- `(app)/(protected)/trips.tsx`: my trips + create
- `(app)/(protected)/join/[code].tsx`: join flow (then remount scope)
- `(app)/(protected)/trip/[tripId].tsx`: decisions, options, votes, presence
- `(app)/(protected)/trip/[tripId]/me.tsx`: my private constraints (clearly
  labelled "only you can see this")
- `(app)/(protected)/trip/[tripId]/plan.tsx`: locked decisions = final plan

Presence: `/ws/presence/trip:<tripId>` (or the SDK presence hook) for
"who's looking at this trip" avatars. Check on day 2 whether the presence
route checks trip membership; if not, anyone with a trip id could see who is
online in it. In that case, gate the route in `realtime-routes.ts` with a
`team_members` lookup, or drop presence. Give the app its own visual design
instead of the starter theme.

---

## 7. Testing

- **Unit (done):** schema rules + lint, group-fit privacy. Run `npm run test:unit`
  (needs a registered app id; see §9).
- **Two-user e2e (`tests/*.spec.ts`, `npx deepspace test run all`):**
  1. A creates trip; B joins via code; B sees trip without manual reload.
  2. B sets budget 300. A queries `constraints`: gets 0 rows. A asks the agent
     for B's budget: refused or empty.
  3. Non-member C calls `addOption` / `toggleVote` with A's tripId → `not_a_member`.
  4. A and B vote; tallies update live in both browsers.
  5. B tries `lockDecision` → `not_organizer`. A locks → B's `toggleVote` refused.
- **Manual:** use it with friends for a real trip; log what broke.

---

## 8. Schedule

| Day | Goal | Done when |
|---|---|---|
| 0 (today) | Scaffold, schemas, access helpers, plan | ✅ typecheck + 6 unit tests pass offline |
| 1 | Register, **choose GitHub source**, deploy empty app; `createTrip`/`joinTrip`; trips + join pages | two browsers: create, join, see trip; membership-refresh bug verified |
| 2 | Decisions, options, `toggleVote`, `lockDecision`, presence; trip page | live voting across two users; lock enforced server-side |
| 3 | Constraints page + action, `researchOption`, group fit, agent tools | research card with sources; fit badge; agent privacy test passes |
| 4 | Cron reminders + auto-lock, plan page, visual design pass | email received; deadline lock observed in `deepspace logs` |
| 5 | e2e suite, real-trip dry run, fixes, writeup, final deploy | important path green on prod URL |

If behind schedule, cut in this order: auto-lock (keep manual lock) → agent
tools (keep research button) → presence avatars. Never cut: privacy of constraints,
server-side vote/lock checks.

---

## 9. Commands (run on your machine)

```sh
cd trip-quorum
npx deepspace auth whoami          # confirm the right account BEFORE registering
npx deepspace app init --json      # mints the app id into wrangler.toml
# Pick the source authority ONCE (permanent): for a GitHub repo, add the
# remote before the first deploy; do NOT run `deepspace push` first.
git remote add origin git@github.com:<you>/trip-quorum.git
npm run validate                   # tsc + unit tests
npx deepspace integrations info exa/search
npx deepspace integrations info anthropic/chat-completion
npx deepspace integrations info email/send
npx deepspace dev start
npx deepspace deploy
```

---

## 10. Agent log (for the writeup)

| When | Agent did | I verified / changed |
|---|---|---|
| Day 0 | Scaffolded with `create-deepspace` 0.44.2 (upgraded npm 10→11 per its engine requirement). Read SDK types + runtime to pick the access model (`'team'` + `team_members`), found create-without-membership gap and the `UserId` notify bug. Wrote schemas, membership guard, group-fit function + tests, this plan. | _fill in: did you read the schema rules? agree with all-writes-via-actions?_ |
