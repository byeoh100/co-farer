# Co-farer: build plan

This is the code plan for the
[Co-farer Master Spec](https://claude.ai/artifact/GvLauMNkadF9e9mYWSecsH)
(copy in `docs/SPEC.md`). How to work through it is in `docs/BUILD_GUIDE.md`.
**The spec decides what the app does; this file decides how it's built.** If
they disagree, the spec wins. Fix this file to match it.

Co-farer is a group trip planner where friends decide on dates, where to
stay, and how to get there together. Each budget is private unless its owner
chooses to share it.

---

## 0. Build rule: one module at a time

Build in this order. Each module must work end to end, be tested with at
least two users, and be **deployed** before the next one starts. If time runs
out, stop at the last finished module and write up the rest as next steps.

| # | Module | Priority | Rough target |
|---|---|---|---|
| 1 | Core: trips, invites, roles, budgets | Must | Day 1 |
| 2 | Dates | Must | Day 2 |
| 3 | Housing (builds the shared suggest-research-vote engine) | Must | Day 3 |
| 4 | Transportation | Should | Day 4 |
| 5 | Notes | Should | Day 4 |
| 6 | Activities (reuses engine) | Nice | Day 5 if time |
| 7 | Food (reuses engine) | Nice | Day 5 if time |

Stretch, only after the module it belongs to is deployed: gas estimates (4),
the best-window helper (2), and automatic deadline locking with email
reminders (3).

Day 5 is reserved for the two-user test pass, a real dry run, the writeup and
the final deploy, whatever else is unfinished.

**How to direct the coding agent:** give it one module section at a time
(for example "Build §4.2 Dates, nothing else"), plus §2 and §3. Don't hand it
the whole spec and ask for the app.

---

## 1. What is already in the repo

- DeepSpace scaffold (create-deepspace 0.44.2).
- `src/schemas/trip-schemas.ts`: Core schemas only (§4.1).
- `src/actions/trip-access.ts`: `requireMember` and `requireOrganizer`
  guards, written in full.
- `src/actions/index.ts`: Core action stubs.
- `src/lib/budget-fit.ts`: the per-category fit counts, the rounded group
  price band, and the person's own budget summary (essentials-only total),
  all written in full. Its tests check that no exact budget leaks out.
- `src/schemas.test.ts`: pins the access rules and runs the SDK's
  `lintSchemas`.
- **Status:** `tsc`, `eslint` and 14 unit tests pass (11 for Co-farer, 3 from the template). Registered, deployed
  empty at https://co-farer.app.space, code on GitHub (byeoh100/co-farer); see §8.

---

## 2. Access model (applies to every module)

- **A trip is a "team".** Membership is stored in `team_members` (`teamId`,
  `userId`, `status`). DeepSpace's `'team'` read rule shows a row only to
  members of that row's trip. Every trip-scoped collection uses
  `read: 'team'` with `teamField: 'tripId'`.
- **All trip writes go through server actions.** In DeepSpace, permission to
  create a row doesn't check trip membership, so a direct client write could
  insert rows into someone else's trip. Every collection therefore sets
  `create/update/delete: false`. Actions run with record permissions off, so
  **every action starts with `requireMember` or `requireOrganizer`**. The
  caller is `ctx.userId`, never a parameter.
- **Budgets:**
  - The private `budgets` collection (`read: 'own'`) holds all figures.
  - `public_budgets` (`read: 'team'`) has a row only for the categories a
    person has switched to public. `setMyBudgets` keeps the two in sync.
  - Fit counts are computed in actions, which can read all budgets, and only
    the counts are stored.
- **Food preferences are public** (spec decision), so Module 7 stores them in
  a `team`-read collection. They're never mixed into budgets.
- **Admins get no extra read rights on trip data.**
- **Leaving a trip:**
  - Membership is set to `status: 'left'`; the row isn't deleted, so the
    notes board can gray out that person's notes.
  - `leaveTrip` calls a cleanup function for each module that has been built:
    remove votes, seat claims and availability. Each new module adds its
    cleanup there. (The spec names only votes and seat claims. Removing
    availability is an assumption: confirm it with the human when building
    Module 2.)
  - Fit counts and price bands only include active members.
  - The organizer can't leave in v1.

**Known DeepSpace behaviors, found by reading the SDK 0.44.2 source:**
- The team read rule is `tripId IN (my trips) OR _created_by = me`. Rows an
  action creates list the caller as creator, so someone who leaves still sees
  rows they created. Acceptable; mention it in the writeup.
- When someone joins, DeepSpace is supposed to refresh their live data, but
  the code that triggers that reads `record.data.UserId` (capital U), while
  the column is named `userId`. So after `joinTrip`, the joiner's page
  probably won't update by itself. **Workaround:** remount the `RecordScope`
  (change its `key`) after joining. **Verify in Module 1** with two browsers,
  and report it to DeepSpace if confirmed.

---

## 3. Shared pieces (build once, reuse)

- **Budget fit** (`src/lib/budget-fit.ts`, done):
  - Fit is counted per category, against that category's budget.
  - Fewer than 3 responses → `tooFewResponses`, and the UI shows a softer
    message.
  - "Price not found" is left out of the fit check.
  - The person's own total adds up **essentials only (housing + gas)**.
  - Food and activity prices are shown for reference only and never checked.
- **Suggest-research-vote engine** (built in Module 3, reused in 6 and 7):
  - `boards`: one per (trip, module), with `lockable`, `status`, `deadline`
    and `winningOptionId`.
  - `options`: `boardId`, `module`, `title`, `url`, `source` (ai/member),
    `researchStatus`, `research` JSON, `estPricePerPerson` (nullable),
    `stale`, and `fit` JSON for housing only.
  - `votes`: approval voting, `uniqueOn [optionId, userId]`.
  - Actions:
    - `suggestOptions` (N = 5 for housing, 10 otherwise; "search for more"
      calls it again)
    - `addOption` (paste a link or a name, then research it)
    - `researchOption`, `toggleVote`
    - `setOptionPrice` (any member fills in a missing price; refits
      housing; adds a `priceSource` of ai/member to options)
    - `setDeadline`/`clearDeadline` and `lockBoard` (lockable boards only)
- **AI research pipeline**, used by `suggestOptions` and `researchOption`:
  1. Check the trip's cap (§6), then increment `researchCallsUsed`.
  2. `exa/search` with the destination, the locked dates (housing), the group
     price band (housing, only if `groupPriceBand` isn't null) or dietary tags
     (food).
  3. `anthropic/chat-completion` with no tools. Its instructions treat page
     text as untrusted data and allow citing only URLs from the search
     results. It returns JSON, checked with zod.
  4. If no price was found, `estPricePerPerson` is null and the option shows
     "price not found".
  - Confirm request shapes first:
    `npx deepspace integrations info exa/search` and
    `… anthropic/chat-completion`.

---

## 4. Modules

Each module lists: data, actions, UI, edge cases, and "done when". Add the
module's schemas to `src/schemas.ts` and its actions to `src/actions/` only
when you start building it.

### 4.1 Core: trips, invites, roles, budgets

- **Data (written):** `trips`, `team_members`, `budgets`, `public_budgets`.
- **Actions:**
  - `createTrip`: creates the trip and the organizer's membership; random
    invite code of 10+ characters.
  - `getInvite`: trip name for the join page; no membership needed; reveals
    nothing else.
  - `joinTrip`: running it twice is harmless, and it reactivates a member
    who left.
  - `leaveTrip`.
  - `rotateInviteCode`: organizer only.
  - `setMyBudgets`: upserts your private row and syncs `public_budgets`:
    adds rows for categories switched to public, deletes them when switched
    back.
- **Pages:**
  1. Landing page and sign in.
  2. **My trips**: list plus create.
  3. **Join** (`/join/[code]`): trip name and a join button.
  4. **Settings** (`/trip/[id]/settings`), shown right after joining:
     - four budgets, each with a private/public switch (private by default);
     - the essentials-only total and over-budget flags;
     - a clear label: "only you can see private budgets".
  5. **Trip page** (`/trip/[id]`): `TripOverview`, laid out in
     `docs/LAYOUT.md`, not tabs. It has the header (members as overlapping
     profile-picture circles, your essentials total, a link to settings), a
     `DatesBar` slot, and four section slots built on one shared
     `ExpandableSection`, which owns the expand animation, focus handling and
     `?section=` URL state. A section that can't be used yet shows disabled
     (grayed card on mobile, thin labeled bar on desktop) and shows a notice
     when clicked. Each module later fills its slot with a `<Name>Summary`
     and a `<Name>Full` component.
- The starter's in-app AI chat isn't in the spec. Hide it in v1. Its tools
  would run as the signed-in user, so they couldn't read anyone else's
  budgets anyway.
- **Done when (two browsers):**
  - A creates a trip, B joins by link and lands on settings, and the trip
    then shows for B without a manual reload (this is the join-refresh check
    from §2).
  - B sets a private housing budget of $150. A gets no B row from `budgets`,
    and no `public_budgets` row for B.
  - B makes gas public. A sees B's gas number next to B's name.
  - A non-member calling `setMyBudgets` with A's `tripId` gets `not_a_member`.

### 4.2 Dates

- **Trip page:** `DatesBar` (the summary in the bar) with its calendar
  pop-up inside (`docs/LAYOUT.md`), not an expanding section.

- **Data:**
  - `availability`: `tripId`, `userId`, `start`, `end`. Dates are stored as
    `YYYY-MM-DD` text, with no times, to avoid time-zone shifts.
  - Added to `trips`: `datesStatus` (open/locked), `datesStart`, `datesEnd`.
- **Actions:**
  - `addAvailability` / `removeAvailability`, for your own ranges; any number
    of ranges, which don't need to overlap.
  - `lockDates` (organizer).
  - `unlockDates` (organizer): resets housing (see edge cases below).
- **Logic:** `src/lib/overlap.ts` is a pure function that returns the number
  of active members free each day. Unit-test it, including ranges that touch
  and ranges that overlap.
- **UI:**
  - A calendar for adding ranges.
  - An overlap heatmap; tapping a day shows who's free.
  - Stretch: a "Help me find the best window" checkbox. The organizer enters a
    trip length, and `bestWindows(counts, nights)` highlights the top
    stretches.
- **Edge cases:**
  - Before unlocking, the app warns that housing will have to be researched
    again.
  - When the organizer confirms, the housing board goes to
    `waiting_for_dates`, votes are cleared, and options are marked `stale`.
  - When the new dates are locked, the board reopens and stale options can be
    re-researched; each re-research counts toward the cap.
- **Done when:** two users add ranges and the heatmap counts match. The
  organizer locks, and the date bar shows locked dates for both. A member
  calling `lockDates` is refused.

### 4.3 Housing (builds the engine)

- **Trip page:** `HousingSummary` (`limit` 1 on mobile, 3 on desktop) and
  `HousingFull`, in the Housing section.

- **Data:** `boards`, `options`, `votes` (§3). The housing board is
  `lockable`, has `fit` on its options, and starts as `waiting_for_dates`.
- **Flow:**
  - Once dates lock, the board opens, and "Suggest" makes the top 5 options
    using the rounded group price band, never one person's number.
  - Anyone can paste a link or add a name, and the AI researches it.
  - Each option card shows a summary, price per person, pros and cons,
    sources, and fit ("over the housing budget for 2 of 6").
- **Locking:**
  - The organizer can set, change or remove the deadline, and can lock early.
  - `lockBoard` with no option picks the top vote; on a tie it returns `tie`,
    and the organizer picks.
  - Locked housing's price per person becomes each member's housing
    *estimate* on their settings page.
- **Fit refresh:** recompute `fit` when an option is researched and when
  anyone changes their housing budget. `setMyBudgets` triggers it for open
  housing boards.
- **Stretch: auto-lock.**
  - A cron job runs every 15 minutes and locks the top option when the
    deadline has passed; on a tie, it stays open and emails the organizer.
  - It emails a reminder to members who haven't voted, 24 hours before the
    deadline.
  - Confirm the email request shape first: `integrations info email/send`.
- **Done when (two browsers):**
  - Before dates lock, the Housing section says it's waiting.
  - After lock, suggestions show sources.
  - A pasted link gets researched.
  - Votes update live in both browsers.
  - Fit counts change when B changes their budget.
  - Locking works and blocks later votes.
  - The cap message shows at 25 calls (set it to 2 temporarily to test).

### 4.4 Transportation

- **Trip page:** `TravelSummary` and `TravelFull`, in the Travel section.

- **Data:**
  - Added to `trips`: `defaultMeetingPoint`.
  - `travel`: `tripId`, `userId`, `mode` (driving / riding / flying / other /
    undecided), `startPoint` (null = the trip default), `seats` (drivers),
    `flightInfo`, `arrivalTime`, `note`. Plus `mpg` for the stretch.
  - `seat_claims`: `tripId`, `driverUserId`, `riderUserId`, with
    `uniqueOn [tripId, riderUserId]` so each rider holds one seat.
- **Actions:**
  - `setMyTravel`. Switching away from driving releases that car's claims;
    lowering seats below the current claims is refused.
  - `claimSeat` / `releaseSeat`. To handle two riders grabbing the last seat
    at once: insert the claim, re-count, and roll back if the car is over
    capacity.
- **UI:**
  - A carpool board grouped by start point. For one shared start, like
    campus, it's a single group.
  - Tap a car to claim a seat; full cars are marked.
  - Flyers and "other" travelers are listed with their details; undecided
    people show as "not decided".
  - The app doesn't suggest who rides with whom.
- **Stretch: gas.**
  - The organizer enters one-way miles. No maps integration was confirmed, so
    the distance is entered by hand; an AI lookup is a later option.
  - Gas price is a default the organizer can edit.
  - Per person: `2 × miles ÷ mpg × gasPrice ÷ people in car`, with a default
    mpg if the driver skips it.
  - The result is that person's gas estimate on their settings page, checked
    against their gas budget.
- **Leave cleanup:** remove the person's claims. If they were a driver,
  release their riders' claims.
- **Done when:** A drives with 3 seats and B claims one; both see it live.
  The car shows full at capacity. B switches to flying and the seat frees up.

### 4.5 Notes

- **Trip page:** `NotesSummary` and `NotesFull`, in the Notes section.

- **Data:** `notes`: `tripId`, `authorId`, `text`.
- **Actions:**
  - `addNote`.
  - `editNote` / `deleteNote`, for your own notes.
  - `removeNote` (organizer, any note, including ones from people who left).
- **UI:**
  - A board of sticky notes showing who wrote each, updating live.
  - Notes whose author has `status: 'left'` are grayed out and marked
    "has left".
  - Not in v1: colors and checkboxes.
- **Done when:** the live add, edit and delete flow works across two
  browsers. B leaves, and B's notes gray out but stay. The organizer removes
  one.

### 4.6 Activities (reuses engine)

- **Trip page:** the Activities part of `AdditionalSummary` and
  `AdditionalFull`, in the shared Additional section.

- The board isn't lockable and has no deadline. The list is ranked by votes.
- `suggestOptions` makes 10. "Search for more" calls it again, and anyone can
  paste a link.
- Each activity shows a description, an estimated price per person
  (reference only, never checked against a budget) and a source link.
- **Done when:** suggestions appear, a pasted link works, and the ranking
  changes as people vote.

### 4.7 Food (reuses engine)

- **Trip page:** the Food part of `AdditionalSummary` and `AdditionalFull`,
  next to Activities in the Additional section.

- **Data:** `food_prefs`: `tripId`, `userId`, `dietary[]`, `likes`,
  `avoids`. Read access is `team`, since the spec makes these public.
  Editing happens in a new section of the settings page.
- `suggestOptions` makes 10 places using the group's dietary tags and likes.
  Research returns an `accommodates[]` list.
- **Warning:**
  - A place that doesn't suit everyone **stays on the list** with a warning
    triangle and a short note, for example "may not suit: vegetarian (2)".
  - It's computed in `src/lib/food-warnings.ts`, a pure function with unit
    tests.
- Prices are for reference only. The list is ranked by votes and never
  locked.
- **Done when:**
  - B marks vegetarian; suggestions reflect it.
  - A place without vegetarian options shows the triangle.
  - Ranking works.

---

## 5. Integrations

| Integration | Used for | Module |
|---|---|---|
| Synced records, team read rule, owner-only reads | Live data, per-trip isolation, private budgets | All |
| Server actions | Every write, and the security checks on it | All |
| `exa/search` | Sources for options | 3, 6, 7 |
| `anthropic/chat-completion` | Structured summaries and prices | 3, 6, 7 |
| Cron + `email/send` | Auto-lock and reminders | 3 (stretch) |

**Deliberately not used (each gets a line in the writeup):**
- **Payments:** nothing is booked.
- **fal image generation:** decoration, not a decision.
- **Google OAuth calendar:** each user would have to grant access, and
  calendar syncing is out of scope.
- **The messaging feature:** DeepSpace's own docs say its channels are
  public, which would leak across trips. Notes cover the need.
- **Collaborative documents (Yjs):** the spec chose a sticky-note board over
  a shared page.
- **Maps:** out of scope; the gas distance is typed in by hand.
- **The in-app AI assistant:** not in the spec.

---

## 6. AI limits

- **About 25 AI research calls per trip**, shared by housing, activities and
  food. Stored as `trips.researchCallsUsed` and checked before every Exa call.
  At the cap, show a clear message instead of researching.
- **"Price not found"** instead of guessing, and the option is left out of
  the fit check until someone adds a price. Any member can set it with
  `setOptionPrice` (§3), and the card then labels it "added by a member", not
  "researched".
- **Cache:** an option isn't re-researched unless someone asks or it's
  marked `stale`.
- The spec says these limits can change later. They're constants in
  `src/constants.ts`.

---

## 7. Testing

- **Unit tests (done):** schema rules and lint, fit counts, price band,
  budget summary. Add `overlap`, `bestWindows`, `food-warnings` and gas math
  as each module is built.
- **Two-user end-to-end tests** in `tests/*.spec.ts`, run with
  `npx deepspace test run all`: one spec file per module, covering its
  "done when" list.
- **Privacy tests, which must always pass:**
  - A can't read B's private budget through `budgets`, `public_budgets`,
    `options.fit`, or a non-member action call.
  - The price band is null with fewer than 3 budgets.
- **Real-world testing:** first, mock trips of 2 to 3 people, to test joining,
  dates and voting. Then the 5 to 6 person Cachuma Lake group as the final
  test. Log what broke for the writeup.

---

## 8. Getting it running (on your machine)

```sh
cd co-farer && npm install
npx deepspace auth login
npx deepspace auth whoami          # make sure it's the right account
npx deepspace app init --json      # mints the app id into wrangler.toml
# Decide where the code lives ONCE (permanent). For GitHub, add the remote
# BEFORE the first deploy, and don't run `deepspace push`.
git remote add origin https://github.com/byeoh100/co-farer.git
git add -A && git commit -m "Register app" && git push -u origin main
npm run validate                   # type check + unit tests (14 at setup)
npx deepspace dev start            # local
npx deepspace deploy               # → co-farer.app.space
npx deepspace app source           # should say GitHub
```

Requirements (from `package.json` engines): Node 22.15+, 24 or 26 (not 23
or 25), and npm 11.6+. The step-by-step version, including test accounts,
is Phase 1 of `docs/BUILD_GUIDE.md`.

---

## 9. Agent log (for the writeup)

| When | Agent did | I verified / changed |
|---|---|---|
| Day 0 | Scaffolded the app (create-deepspace 0.44.2). Read the SDK source to choose the access model. Found the create-without-membership gap and the `UserId` join-refresh bug. Wrote the first plan. | I identified the project requirements and brainstormed the idea. |
| Planning | Voice sessions: wrote Spec v1, the five module docs and the priorities list, then merged them into the Master Spec, with conflicts resolved, the screens and flow, edge cases and AI limits. | You made every product decision: per-category budgets, essentials-only total, public food prefs, wait for dates before housing, a sticky-note board, warnings instead of filtering out food places. |
| Plan update | Rewrote this plan and the code to match the Master Spec. Cut the code back to Core only. Replaced the single private constraints table with private `budgets` plus a `public_budgets` projection, so each category gets its own privacy switch. Added the rounded group price band. Tests: 14 passing (11 new). | Section 2 and 4.1 relating to data access and core application functions have been read and verified. The application's goals have been laid out correctly. |
| Setup (2026-11-21) | Phase 1: renamed the project from Trip Quorum to Co-farer in code, config and docs (your call). Registered the app as `co-farer`, added the GitHub remote and pushed, then made the first deploy to https://co-farer.app.space; `app source` confirms the code lives on GitHub. Validate: 14 tests pass. `alice@`/`bob@deepspace.test` were already taken (test emails are global across all developers), so the test accounts are `alice-cofarer@` and `bob-cofarer@deepspace.test`. Saved the Exa and Anthropic request shapes to `docs/integrations.md`; Anthropic printed no output schema. | I could reach the website and sign in with my email successfully. |
| Layout update (2026-11-21) | Added `docs/LAYOUT.md` and the two mockups. The trip page is now one overview (`TripOverview`) instead of tabs: a header with profile-picture circles, a date bar whose calendar opens as a pop-up (no dimmed screen), and four expanding sections. Activities and Food share "Additional". Unavailable sections stay visible but disabled, which replaces "hidden". Before dates lock, the date bar shows only "Not locked yet"; the overlap hint moves to the best-window stretch. Before estimates exist, the header total reads "Budget $X · no estimates yet". Updated the spec, plan and build guide to match. UI only: no actions, schemas or privacy rules changed. | _fill in_ |
