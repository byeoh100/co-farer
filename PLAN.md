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
- **Confirmed in Module 1:** the join-refresh bug is real; the remount
  workaround is in `src/lib/scope-refresh.ts`.
- **Found in Module 2:** with `teamField: '_rowId'`, a team member who didn't
  create the row gets it on load but **never gets live updates to it** (only
  the creator does). `trips` now has a real `tripId` column, which is the team
  field, set equal to the row id by `createTrip`. Trips created before this
  change have no `tripId`, so only their organizer can still see them.
  Report this to DeepSpace too.
- **Found in Module 3:** the team read rule passes one SQL value per trip
  you belong to, and the Durable Object's SQLite allows about 100, so a person
  in more than ~100 trips can't load trip data ("too many SQL variables").
  Real users won't get near that; test accounts did (Alice reached 117).
  Tests now delete their old trips through `cleanupMyTestTrips`, which works
  only for @deepspace.test accounts on a local server. Report this too.

---

## 3. Shared pieces (build once, reuse)

- **Budget fit** (`src/lib/budget-fit.ts`, done):
  - Fit is counted per category, against that category's budget.
  - In a trip of 3+ members, fewer than 3 responses → `tooFewResponses`,
    and the UI shows a softer message. Trips of 1–2 members need only one
    budget (`minResponses`; the human's decision in Module 3).
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

- **Data (written):** `trips`, `team_members` (plus `displayName` and
  `imageUrl`, a per-trip copy of the member's profile), `budgets`,
  `public_budgets`, `profiles` (each person's own name and picture,
  owner-only). DeepSpace manages `name` and `imageUrl` on `users` from the
  sign-in identity, so they can't hold a custom profile. On `users`,
  non-admins get no direct writes, and `roster: 'read-policy'` keeps names
  and pictures out of the app-wide user list, so they're visible only to
  tripmates.
- **Actions:**
  - `createTrip`: creates the trip and the organizer's membership; random
    invite code of 10+ characters.
  - `getInvite`: trip name for the join page; no membership needed; reveals
    nothing else.
  - `joinTrip`: running it twice is harmless, and it reactivates a member
    who left.
  - `leaveTrip`.
  - `rotateInviteCode`: organizer only.
  - `updateMyProfile`: the one action that isn't about a single trip
    (approved exception to `requireMember`). Saves your name and picture
    to `profiles`, then copies them into each of your memberships. Pictures must come from
    the app's own file storage (`/api/files/...?scope=app`).
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
     `DatesBar` slot, and four section slots. A section that can't be used
     yet shows disabled (grayed card on mobile, thin labeled bar on desktop)
     and shows a notice when clicked: "This part isn't ready yet", or for
     Housing before dates lock, "Housing opens once the dates are locked".
     Each module later fills its slot with a `<Name>Summary` and a
     `<Name>Full` component. The shared `ExpandableSection` (expand
     animation, focus handling, `?section=` URL state) is built in Module 3,
     the first module with a section to expand.
  6. **Profile** (`/settings`): name and picture. Without a picture, the
     avatar is the first letter of the first name on a color fixed per person.
- **Members:** overlapping circles, Google Docs style. Online members are in
  color and offline ones grayed, from a per-trip presence room
  (`trip:<tripId>`) that only active members can join
  (`src/server/realtime-routes.ts`). Clicking the circles opens the members
  panel: names, public budgets, and for the organizer the invite link.
- The starter's in-app AI chat isn't in the spec. Hide it in v1: the chat UI
  is off (no `ai_chats` schema) and `<AgentTools />` is unmounted. Its tools
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
  - An overlap calendar: each day shows the circles of the people free that
    day (up to 3, then "+N"), instead of a heatmap (the human's call in
    Module 2); tapping a day lists who's free.
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
- **Decided with the human (Module 2):**
  - Your own overlapping or touching ranges blend into one.
  - Limits: the end can't be before the start; a range can't end in the past;
    at most 60 days per range entered and 20 ranges per person (after blending).
  - Availability is read-only while the dates are locked.
  - Leaving a trip removes your availability.
  - Until Housing exists, unlocking only says availability is kept; Module 3
    adds the "housing will be researched again" warning to `unlockDates`
    through `src/actions/dates-unlock.ts`, shown only when housing has options.
- **Done when:** two users add ranges and the per-day counts match. The
  organizer locks, and the date bar shows locked dates for both. A member
  calling `lockDates` is refused.

### 4.3 Housing (builds the engine)

- Also builds the shared `ExpandableSection` (`docs/LAYOUT.md`), deferred
  from Module 1.

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

- **Decided with the human (Module 3):**
  - Research model: Claude Opus 5.5 (`RESEARCH_MODEL` in `src/lib/limits.ts`).
  - No real AI calls during development until the human says so; the reply
    reader accepts likely formats and logs only the reply's keys if unknown.
  - Automated tests use a local AI stand-in (test accounts on a local server
    only; `src/actions/local-test.ts`). Manual checks use the real AI.
  - At the deadline the top-voted option locks automatically (cron every 15
    minutes, plus any vote after the deadline). A tie stays open, voting
    closed, and the organizer picks.
  - Every trip must have a destination; organizers can edit it.
  - Prices are stored as the total for the whole stay and group (what the AI
    reads from listings, and what members type in). The per-person share is
    the total ÷ the current group size, recomputed when people join or
    leave, and cards show both.
  - One research call = one "Suggest" or one researched link/name.
  - After the first manual test:
    - The deadline is a number of days to decide (1–30), not a date and
      time; the status counts down ("Voting closes in 3 days").
    - A place can be removed, with its votes, by whoever added it (or asked
      for the suggestion) or by the organizer.
    - Unlocking the dates deletes housing's places and votes instead of
      marking them out of date; after relocking, Suggest starts fresh. The
      research count is not reset.
    - Places you haven't pointed at or tapped yet have a "New" outline. What
      you've seen is kept in your browser only.
    - Cards show a photo when the search returns one for that page (Exa's
      `image` or `extras.imageLinks`). The photo comes from the search
      results, never from the model, and only `https` images load, with no
      referrer.
    - Search order (the human's list): one search limited to Booking.com,
      Expedia, KAYAK, Skyscanner and Trivago (prices, reviews, photos),
      plus one that excludes them, to find the places' own websites for
      specifics. Google Hotels is left out because it lives on google.com.
      Both searches together count as one research call. Exa also returns
      the passages that mention prices and ratings, and the model may use an
      advertised nightly or "from" rate.
    - Trips of 1–2 members skip the 3-budget minimum: fit counts show (and
      the search's price band uses their budgets) as soon as one budget is
      set. A solo trip reads "Fits your housing budget". From 3 members on,
      the minimum applies again, switching automatically as people join.
    - The search's price band no longer waits for 3 budgets. When only some
      people have set one, it's centered on their average (rounded to $50)
      and the search also gets the whole group's total (that × group size),
      so the people without a budget are counted at the average. One budget
      in a trip of 3+ gives no band, since it would be that person's
      number. Fit on the cards still follows the rule above.

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

- **Decided with the human (Module 4):**
  - The organizer sets the trip's meeting point in Trip details (optional).
    Drivers can set their own starting point; cars are grouped by it.
  - Seats are passenger seats, not counting the driver (1–12).
  - The driver can take a rider out of their car (with a confirm), and
    riders can leave a car themselves. Either way the rider goes back to
    "not decided".
  - Riders have a pickup note (often an address), shown only to the people
    in that car: `pickup_notes` is owner-only, and the car reads it through
    `getCarPickups`, which checks the caller is the driver or a rider. The
    claim row carries only a counter (`pickupVersion`) so the car refetches.
  - Travel is usable right away, before the dates lock.
  - "Another way" has a dropdown (flight, train, bus, drop-off, other),
    optional from/to dates and a details line. ("Flying" in the plan's data
    list is `mode: 'other'` with `otherKind: 'flight'`.)
  - Gas estimates wait until the end, with the other stretch goals.

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

- **Decided with the human (Module 5):**
  - Notes are at most 280 characters, newest first, at most 200 per trip.
  - Notes is usable right away, like Travel.
  - Edited notes say "edited". One sticky color for all notes.
  - Only the organizer can remove notes from people who left; they go
    back to normal if the person rejoins.

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
  - The price band is null with just one budget in a trip of 3+ members
    (trips of 1–2 members use any budgets set).
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
| Layout update (2026-11-21) | Added `docs/LAYOUT.md` and the two mockups. The trip page is now one overview (`TripOverview`) instead of tabs: a header with profile-picture circles, a date bar whose calendar opens as a pop-up (no dimmed screen), and four expanding sections. Activities and Food share "Additional". Unavailable sections stay visible but disabled, which replaces "hidden". Before dates lock, the date bar shows only "Not locked yet"; the overlap hint moves to the best-window stretch. Before estimates exist, the header total reads "Budget $X · no estimates yet". Updated the spec, plan and build guide to match. UI only: no actions, schemas or privacy rules changed. | Verified that Claude understood the layout changes requested. |
| Module 1: Core (2026-11-21) | Built the Core actions (`createTrip`, `getInvite`, `joinTrip`, `leaveTrip`, `rotateInviteCode`, `setMyBudgets`, `updateMyProfile`), each guarded by `requireMember`/`requireOrganizer` except `updateMyProfile` (approved exception: it isn't about a single trip, uses only `ctx.userId` and touches only the caller's rows). Pages: landing, My trips, Join, trip settings (budgets, privacy switches, Leave), `TripOverview` with disabled sections, and Profile with a picture-centering pop-up. Members show as Google Docs-style circles, in color when online and gray when not, from a per-trip presence room that only active members can join. Your decisions: one profile shown only to tripmates (`roster: 'read-policy'`, per-trip copy in `team_members`); default avatar is the first initial on a color fixed per person; disabled-section notice says "This part isn't ready yet"; `ExpandableSection` moved to Module 3; on leaving, public budget rows are removed and the private row is kept; add the picture cropper. What broke: (1) the join-refresh bug from §2 is real (the SDK reads `UserId`); the `RecordScope` remount workaround passes the two-user test. (2) Saving a profile failed because DeepSpace manages `name` and `imageUrl` on `users`; moved profiles to an owner-only `profiles` collection and gave non-admins no direct `users` writes. (3) The e2e run hung because Playwright waits on `aria-disabled` buttons; the test now forces the click. (4) The starter's API-status test was flaky (a 100 ms loading state); lengthened it to 1 s. (5) A raw `budgets` read through the browser tool route isn't available in this SDK (404), so that check was dropped; the schema test pins `budgets` as owner-only. Tests: 33 unit, 15 e2e passing. Deployed to https://co-farer.app.space. | Tested all built features with the following flow: logged into site with 2 accounts. Created a trip on account A. Tested private and public budget visibilities. Invited B to trip, checked budget visibilities. Checked "not online" greyed out feature. Tested customizing profile. Noted that we need a icon centering widget. Trip privacy outside of link tested. Phone view tested. Tested leaving the trip. Tested links and expired links. |
| Module 1 fix (2026-11-21) | Safari: copying the invite link failed on the first open of the members panel (the async clipboard API was refused; it never reproduced in Chromium). Added a fallback that selects the link box and uses the older copy command, plus an e2e test that forces the clipboard API to refuse. Also found that Safari can't sign in on the local dev server: DeepSpace's session cookie is `__Secure-`/`Secure`, which Safari drops on plain `http://localhost` (Chrome and Firefox allow it). Safari testing uses the live site. Deployed. | Found that copying the invite link in Safari said "could not copy link" the first time the members panel was opened, but worked after a refresh. Found that Safari sign-in didn't work on the local server. Approved deploying the fix and verified sign-in works on the live site. |
| Module 2: Dates (2026-11-21) | Built `availability` plus the trip date fields; the actions `addAvailability` (blends your own overlapping or touching ranges), `removeAvailability`, `lockDates` and `unlockDates` (organizer only), with an empty "when dates unlock" step list for Module 3; leave cleanup removes your dates. `src/lib/dates.ts` holds the pure date logic (validation, merging, per-day counts, month grid; 18 unit tests). The date bar shows "Not locked yet" or the locked dates with how many are free for all of them. The calendar pop-up is animated, closes on an outside click or Escape, and doesn't dim the page. Organizer has a "Final dates" mode, and unlocking asks to confirm. Your decisions: availability removed on leave; simple unlock warning until Housing exists; read-only while locked; limits (no reversed or past ranges, 60 days per range, 20 ranges); blend overlapping ranges; show each free person's circle on the calendar instead of a heatmap; thin dark outline on all profile circles. What broke: (1) a DeepSpace bug: with `teamField: '_rowId'`, only a row's creator got live updates, so B never saw the lock; `trips` now uses a real `tripId` column (older trips are visible only to their organizer). (2) The profile e2e test left a fake picture and name on the shared Alice account; it now restores them, and avatars fall back to the initial when a picture fails to load. (3) The unlock confirmation would close with the pop-up, so it moved outside the pop-up. Tests: 51 unit, 18 e2e passing. Deployed. | Asked for overlapping date ranges from the same person to blend into one. Found a bug where joining from an invite said "trip not found" even though the new member showed up greyed out. Replaced the heatmap idea with each person's circle on the days they're free. Noted that white profile pictures were hard to see; asked for a thin black outline on the calendar and the online status. Verified everything worked on the live site before moving on. |
| Module 3: Housing (2026-11-21) | Built the shared engine (`boards`, `options`, `votes`) and Housing: Suggest (Exa search, then Claude Opus 5.5 with no tools; the search uses only the rounded group price band), add a link or name, live approval voting, fit counts, prices, a deadline that auto-locks the top option (cron every 15 minutes; a tie stays open for the organizer), lock early, and the 25-call cap. Built `ExpandableSection` (the card grows to fill the page, `?section=housing`, Escape and Back close it). Destination is now required and editable by the organizer. Safety in code: search text is wrapped as untrusted data, sources not in the search results are dropped, a missing price stays "Price not found". Automated tests use a local AI stand-in for test accounts only. What broke: (1) another DeepSpace limit: the team read rule passes one SQL value per trip, so an account in ~100+ trips can't load trip data; tests now delete their own old trips (`cleanupMyTestTrips`, local test accounts only), and local data was cleared once with your OK. (2) The Core test expected Housing to say "isn't ready yet"; it now expects the dates notice. After your first test: deadline in days, remove a place, total prices shown with per person, unlocking clears housing, "New" outlines, photos on cards; searches go to the booking and comparison sites first, then the places' own websites, with price passages pulled out; trips of 1–2 members show fit and use their budgets for the price band with just one budget set (spec and build guide updated); when only some people set a budget, the search's price range is their average (per person and × group size). Tests: 81 unit, 20 e2e passing. Deployed. | Tested the housing section with the real AI. Changed the voting deadline to a number of days instead of a date and time. Pasted random links on purpose and found the cards said the info was unrelated, with no way to remove them; asked for a remove option. Changed manual prices to the total for the stay, shown alongside the per person price. Found that unlocking and relocking the dates left old places that "5 new AI suggestions" couldn't replace; asked for housing to clear instead. Asked for new suggestions to be outlined until moused over, and for photos of each place. Noticed the AI usually couldn't find prices and the photos weren't great; asked for the search to prioritize Google Hotels, KAYAK, Skyscanner, Trivago, Booking.com and Expedia, plus the hotel's own website for specifics. Asked why fit needed 3 budgets; decided that solo and 2-person trips should show fit without the hiding, since a solo traveler only has their own budget and two people travelling together already know each other's. Kept the 3-budget rule for groups of 3+. Asked for the search not to ignore budgets that are set: when only some people set one, average them and multiply by the group size to get a price range that includes everyone. |
| Module 4: Transportation (2026-11-21) | Built `travel`, `seat_claims` and `pickup_notes` plus the trip's meeting point; the actions `setMyTravel`, `claimSeat`, `releaseSeat`, `setPickupNote` and `getCarPickups`, each guarded by `requireMember`. `src/lib/travel.ts` holds the pure logic (input checks, who keeps a seat in a race, the board layout; 7 unit tests). The Travel section is usable right away: pick driving (passenger seats, optional start point), riding (tap a car), another way (flight, train, bus, drop-off or other, with from/to dates and details) or not decided. The carpool board groups cars by starting point and shows filled and empty seats and "Full"; flyers and others are listed with their details. Server rules: the last-seat race keeps the earlier claim, seats can't go below the riders, switching away from driving or leaving releases the riders. Your decisions: organizer sets the meeting point; seats exclude the driver; the driver can remove riders and riders can leave; a pickup note seen only by that car (owner-only rows, read through an action that checks the caller is in the car); Travel open before the dates lock; the "another way" dropdown with dates; gas waits for the end. The Core test now checks the disabled-section notice on Notes, since Travel is open. Nothing broke this time. Tests: 89 unit, 22 e2e passing. Deployed. | Decided the meeting point is set by the organizer, seats don't count the driver, and drivers can remove riders while riders can remove themselves. Asked for a pickup note on each seat so the driver can see addresses easily. Asked for a dropdown for things that aren't cars (flight, train, drop-off) with from/to dates. Decided to leave gas estimates for later. Tested the carpool board and approved shipping. |
| Module 5: Notes (2026-11-21) | Built `notes` and the actions `addNote`, `editNote` and `deleteNote` (your own notes only, guarded by `requireMember`) and `removeNote` (organizer only, any note). `src/lib/notes.ts` checks the text (trimmed, line breaks kept, 280 characters). The Notes section is a live board of sticky notes, newest first, each with the author's circle, name, time and "edited"; you edit or delete your own, and the organizer removes any after a confirm. Notes from people who left stay, grayed out and marked "has left". The overview card shows the count and the latest note (mobile) or the latest 3 (desktop). Your decisions: 280 characters, newest first, 200 notes per trip, open right away. The Core test now checks the disabled-section notice on Additional, since Notes is open. Nothing broke. Tests: 92 unit, 23 e2e passing. Deployed. | Agreed to the suggested note length, order, limit, and having Notes open right away. Tested the notes board and approved shipping. |
